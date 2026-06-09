import logging
import os
import torch
import toml
from collections import OrderedDict
from fastapi import Request

from nnsight import CONFIG
from nnterp import StandardizedTransformer
from nnsight.intervention.backends.remote import RemoteBackend

from .data_models import ModelHeat

from .metadata import (
    MetadataCache,
    ModelMetadata,
    UnsupportedModel,
)
from .telemetry import TelemetryClient

logger = logging.getLogger(__name__)


class AppState:
    """Central runtime state for model loading, catalog tracking, and metadata.

    The workbench tracks models at three levels:

    1. **Catalog** — what NDIF currently deploys (refreshed on each
       ``/models`` poll).
    2. **Metadata** — static HuggingFace info (gated, layer count, etc.),
       cached to disk via ``MetadataCache``.
    3. **Loaded wrappers** — in-memory ``StandardizedTransformer`` instances,
       created lazily and LRU-evicted for non-pinned models.

    Class attributes:
        max_non_pinned_models: Maximum concurrently loaded non-pinned models.
            Pinned models are exempt from this cap and from eviction.

    Instance attributes:
        remote: Whether inference runs against NDIF rather than locally.
        models: Loaded ``StandardizedTransformer`` wrappers keyed by repo ID.
        catalog: NDIF deployment roster mapping repo ID to ``ModelHeat``. This
            drives the frontend model list; whether a model is actually loaded
            here is a separate concern.
        pinned: Repo IDs that must never be LRU-evicted. Populated from TOML in
            local mode, or from NDIF pin status in remote mode.
        _metadata: Disk-backed metadata cache; owns HuggingFace fetch/persist.
        _active_models: Loaded non-pinned models in recency order (LRU) — the
            working set subject to eviction. Pinned models are permanent and
            never tracked here.
        ndif_backend_url: Base URL for NDIF API calls (set during init).
        telemetry_url: InfluxDB endpoint for request telemetry (set during init).
    """

    max_non_pinned_models: int = 5

    def __init__(self):
        """Initialize backend config, load TOML, and preload pinned models locally."""

        self.models: dict[str, StandardizedTransformer] = {}
        self._metadata = MetadataCache()
        self.catalog: dict[str, ModelHeat] = {}

        self.remote = self._load_backend_config()
        self.pinned = set(self._load_pinned_config()) if not self.remote else set()
        self._active_models: OrderedDict[str, None] = OrderedDict()

        # TelemetryClient.init(self)

    # ----- metadata facade (delegates to MetadataCache) ---------------------

    @property
    def model_metadata(self) -> dict[str, ModelMetadata]:
        """Read-only view of cached metadata keyed by repo ID.

        Used by authorization checks (e.g. ``auth.user_has_model_access``).
        """
        return self._metadata.metadata

    # ----- catalog (what NDIF currently deploys, surfaced to the frontend) ---

    def register_catalog_entry(self, model_name: str, heat: ModelHeat, pinned: bool = False) -> None:
        """Add or update a catalog entry for a model NDIF currently deploys.

        Fetches and caches metadata on first sight. Does **not** load the
        nnsight wrapper — that happens lazily via ``get_model`` when a request
        actually needs the model.

        Silently skips unsupported models (LoRA adapters, vision models,
        ``trust_remote_code`` repos) and ``Meta-Llama-*`` legacy aliases.

        Args:
            model_name: HuggingFace repo ID.
            heat: Current NDIF deployment heat for this model.
            pinned: NDIF-reported pin status. Pinned models are never
                LRU-evicted; unpinned models participate in eviction once loaded.
        """
        # Legacy Meta-Llama-* repos duplicate Llama-* names since 3.1; skip
        # them so the catalog does not list both variants.
        if model_name.split("/")[-1].lower().startswith("meta-llama"):
            logger.info(f"Skipping Meta-Llama alias: {model_name}")
            return

        try:
            self._metadata.fetch_metadata(model_name)
        except UnsupportedModel:
            # Cache already logged and persisted the verdict.
            return
        except Exception as e:
            logger.warning(f"Failed to fetch metadata for {model_name}, skipping catalog entry: {e}")
            return

        self.catalog[model_name] = heat
        if pinned:
            self.pinned.add(model_name)
            # If it was previously in the LRU as non-pinned, take it out — it
            # no longer participates in eviction.
            self._active_models.pop(model_name, None)
        else:
            # Transitioned out of pinned (NDIF un-pinned it). Drop from pinned
            # set; future get_model calls will treat it as non-pinned and put
            # it in the LRU.
            self.pinned.discard(model_name)

    def deregister_catalog_entry(self, model_name: str) -> None:
        """Remove a catalog entry for a model NDIF no longer serves.

        Non-pinned wrappers are unloaded immediately. Pinned wrappers are kept
        in memory in case the deployment flaps back online.
        """
        self.catalog.pop(model_name, None)
        was_pinned = model_name in self.pinned
        self.pinned.discard(model_name)
        
        if not was_pinned:
            self._unload_model(model_name)

    def get_catalog(self) -> list[dict]:
        """Return the user-facing model list for remote mode.

        Each entry combines cached HuggingFace metadata with the current
        deployment heat as ``status``.

        Returns:
            List of model metadata dicts. Models without cached metadata are
            omitted.
        """
        out = []
        for name, heat in self.catalog.items():
            meta = self._metadata.get(name)
            if meta is None:
                continue

            entry = meta.model_dump()
            entry["status"] = heat.value
            out.append(entry)

        return out

    # ----- loading (lazy, LRU-evicted for non-pinned) ----------------------

    def get_model(self, model_name: str) -> StandardizedTransformer:
        """Return a loaded model wrapper, loading on demand if needed.

        Non-pinned models are tracked in an LRU cache. Loading a new
        non-pinned model may evict the least-recently-used one when the count
        exceeds ``max_non_pinned_models``. Already-loaded non-pinned models
        have their LRU position bumped on each access.

        Args:
            model_name: HuggingFace repo ID.

        Returns:
            The ``StandardizedTransformer`` wrapper for ``model_name``.

        Raises:
            KeyError: If ``model_name`` is not in the catalog or pinned set.
        """
        if model_name not in self.catalog and model_name not in self.pinned:
            raise KeyError(model_name)

        if model_name not in self.models:
            self._load_model(model_name)

            if model_name not in self.pinned:
                self._active_models[model_name] = None
                self._evict_if_needed()
        
        elif model_name not in self.pinned:
            # Already loaded; bump recency.
            self._active_models.move_to_end(model_name)
        
        return self.models[model_name]

    def _evict_if_needed(self) -> None:
        """Evict the oldest non-pinned models until within ``max_non_pinned_models``."""
        while len(self._active_models) > self.max_non_pinned_models:
            oldest, _ = self._active_models.popitem(last=False)
            logger.info(f"LRU evicting non-pinned model: {oldest}")
            self._unload_model(oldest)

    def _unload_model(self, model_name: str) -> None:
        """Remove a model wrapper from memory.

        Metadata for ``model_name`` is retained in the cache.
        """
        self.models.pop(model_name, None)
        self._active_models.pop(model_name, None)

    # ----- public accessors ------------------------------------------------

    def get_model_metadata(self, model_name: str) -> ModelMetadata:
        """Return cached metadata for ``model_name``.

        Raises:
            KeyError: If metadata has not been fetched for this model.
        """
        return self._metadata.metadata[model_name]

    def get_all_model_list(self) -> list[dict]:
        """Return every model with cached metadata (local mode).

        In remote mode, prefer ``get_catalog`` which reflects the current NDIF
        deployment roster.
        """
        return self._metadata.all_dumped()

    def make_backend(self, model: StandardizedTransformer | None = None, job_id: str | None = None):
        """Create an nnsight backend for the current deployment mode.

        Returns a ``RemoteBackend`` when ``self.remote`` is True, otherwise
        ``None`` (local execution uses the in-process model directly).

        Args:
            model: Loaded wrapper; its model key is forwarded to NDIF when
                starting a new remote job.
            job_id: Existing NDIF job ID for polling results.
        """
        if self.remote:
            return RemoteBackend(
                job_id=job_id,
                blocking=False,
                model_key=model.to_model_key() if model is not None else None,
            )
        else:
            return None

    def __getitem__(self, model_name: str):
        """Alias for ``get_model`` — enables ``state[model_name]`` in handlers."""
        return self.get_model(model_name)

    # ----- bootstrap -------------------------------------------------------

    def _load_backend_config(self):
        """Read deployment settings from environment and configure nnsight.

        Sets ``self.remote``, ``self.ndif_backend_url``, and
        ``self.telemetry_url``. Configures the global nnsight ``CONFIG`` object
        with the NDIF host and API key.

        Returns:
            Whether remote (NDIF) mode is enabled.
        """
        remote = os.environ.get("REMOTE", "true").lower() == "true"
        logger.info(f"Using Local Deployment? {not remote}")
        if remote:
            ndif_backend = os.environ.get("NDIF_API_HOST")
            if ndif_backend is not None:
                CONFIG.API.HOST = ndif_backend

        CONFIG.set_default_api_key(os.environ.get("NDIF_API_KEY"))

        self.ndif_backend_url = CONFIG.API.HOST
        logger.info(f"Backend URL: {self.ndif_backend_url}")
        self.telemetry_url = f"{CONFIG.API.HOST}:{os.environ.get('INFLUXDB_PORT', '8086')}"
        logger.info(f"Telemetry URL: {self.telemetry_url}")

        return remote

    def _load_pinned_config(self) -> list[str]:
        """Load pinned repo IDs from TOML and preload them in local mode.

        The TOML file is selected by the ``CONFIG`` env var (default ``dev``).
        In local mode, pinned models are fetched and loaded onto GPU at startup.
        In remote mode the pinned list is ignored — pin status comes from NDIF.

        Returns:
            Pinned repo IDs from the TOML file.
        """
        env = os.environ.get("CONFIG", "dev")
        logger.info(f'Loading "{env}" config')

        current_path = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_path, f"_model_configs/{env}.toml")

        with open(config_path, "r") as f:
            pinned: list[str] = toml.load(f).get("pinned", [])

        if not self.remote:
            for model_name in pinned:
                self._metadata.fetch_metadata(model_name)
                model = StandardizedTransformer(
                    model_name,
                    device_map="auto",
                    torch_dtype=torch.bfloat16,
                    remote=self.remote,
                )
                self.models[model_name] = model
        return pinned

    def _load_model(self, model_name: str):
        """Load a single model wrapper on demand.

        Ensures metadata is cached, then constructs a ``StandardizedTransformer``.
        In remote mode the wrapper is used for tokenization and dispatch only;
        weights are not loaded locally.
        """
        logger.info(f"Loading model: {model_name}")

        self._metadata.fetch_metadata(model_name)

        model = StandardizedTransformer(
            model_name,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            remote=False,
            allow_dispatch=not self.remote,
            check_renaming=not self.remote,
        )

        self.models[model_name] = model


def get_state(request: Request) -> AppState:
    """FastAPI dependency that returns the application ``AppState`` instance."""
    return request.app.state.m
