"""Model metadata fetching, supportability checks, and the persisted cache.

HuggingFace repo IDs are probed once and the results are written to
``_metadata_cache.json`` (path overridable via ``METADATA_CACHE``).
The cache stores both successful ``ModelMetadata`` records and negative
``UnsupportedModel`` verdicts so restarts do not re-fetch every model.

Public API:

    ``ModelMetadata``
        Pydantic record returned to the frontend (name, layer count, params,
        chat/base classification, gating flag).

    ``UnsupportedModel``
        Raised for repos outside workbench support: LoRA adapters, vision /
        multimodal architectures, ``trust_remote_code`` models, or configs
        that cannot be loaded.

    ``MetadataCache``
        In-memory registry backed by the JSON file. ``fetch_metadata(name)``
        is the sole fetch entry point.

    ``fetch_model_metadata``
        Low-level HuggingFace probe; normally called via
        ``MetadataCache.fetch_metadata``.

    ``GATED_THRESHOLD_PARAMS``
        Parameter-count threshold for workbench guest access control.
        Override via ``GATED_THRESHOLD_PARAMS``.
"""

import json
import logging
import os
import re

from huggingface_hub import get_safetensors_metadata
from pydantic import BaseModel
from transformers import AutoConfig
from transformers.models.auto.modeling_auto import MODEL_FOR_CAUSAL_LM_MAPPING_NAMES

logger = logging.getLogger(__name__)

# Persisted metadata cache location. Override via METADATA_CACHE.
# When the schema or any derived-value rule changes (e.g. flipping the
# gated-policy direction, fixing the supportability check), delete this
# file by hand to force a full re-fetch on next startup.
METADATA_CACHE_PATH = os.environ.get(
    "METADATA_CACHE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "_metadata_cache.json"),
)

# Workbench gating policy: a model is "gated" (guests can't use it) when its
# parameter count is at or above this threshold. Overrides HF Hub's gated
# field — this attribute is repurposed as workbench-side access control.
# Default is just above 8B so 8B-class models (Llama-3.1-8B etc.) stay ungated.
# Override via WORKBENCH_GATED_THRESHOLD_PARAMS.
GATED_THRESHOLD_PARAMS = int(
    os.environ.get("GATED_THRESHOLD_PARAMS", "9000000000")
)

# `config.model_type` values for known vision/multimodal architectures.
# Defensive: most VLMs already get caught by the vision-config attribute
# check below, but a few use non-standard config dialects.
VISION_MODEL_TYPES = {
    "llava", "llava_next", "llava_next_video", "llava_onevision",
    "idefics", "idefics2", "idefics3",
    "paligemma",
    "qwen2_vl", "qwen2_5_vl",
    "internvl_chat",
    "blip", "blip-2", "blip2", "instructblip",
    "kosmos-2", "kosmos2",
    "fuyu",
    "mllama",  # Llama-3.2-Vision
    "pixtral",
    "video_llava", "vipllava",
    "git",
}

# Chat/instruct classification is name-based, NOT tokenizer-chat-template-based.
# The tokenizer signal is unreliable: several families (notably Qwen) bundle a
# chat_template into their BASE tokenizers, so `chat_template is not None` would
# misclassify e.g. `Qwen2.5-7B` (base) as a chat model. Repo naming is the
# strongest cross-ecosystem signal — instruct/chat post-trained models almost
# always carry a marker in the name, base models don't.
#
# Tokens matched (case-insensitive) as hyphen/underscore/slash-delimited
# segments of the repo's last path component:
#   - generic post-training markers: instruct, chat, it (gemma), rlhf, dpo,
#     sft, orpo
#   - well-known marker-less chat families (so they don't fall to "base")
_CHAT_NAME_RE = re.compile(
    r"(?:^|[-_/.])"
    r"(?:instruct|instruction|chat|it|rlhf|dpo|sft|orpo|"
    r"hermes|vicuna|zephyr|wizardlm|tulu|openchat|dolphin)"
    r"(?:[-_/.]|$)",
    re.IGNORECASE,
)


def _is_chat_model(model_name: str) -> bool:
    """Return whether the repo name marks an instruction- or chat-tuned model.

    Classification is based on the repo's last path component (e.g.
    ``Llama-3.1-8B-Instruct``), not on the tokenizer's chat template, which
    is unreliable across ecosystems.
    """
    label = model_name.split("/")[-1]
    return _CHAT_NAME_RE.search(label) is not None


class UnsupportedModel(Exception):
    """Raised when a repo is outside workbench's supported model surface.

    Typical causes: LoRA adapter repos, vision/multimodal architectures,
    models requiring ``trust_remote_code``, or configs that fail to load.
    """


class ModelMetadata(BaseModel):
    """Derived metadata for a HuggingFace model repo.

    Attributes:
        name: Full repo ID (``org/model``).
        is_chat: Whether the repo name indicates an instruct/chat variant.
        n_layers: Transformer block count from ``AutoConfig``.
        params: Human-readable parameter count (e.g. ``"7B"``), or
            ``"unknown"`` when safetensors headers are unavailable.
        gated: Workbench access-control flag. True when parameter count is at
            or above ``GATED_THRESHOLD_PARAMS`` (guests cannot use gated
            models). This replaces HuggingFace Hub's native gated field.
    """

    name: str
    is_chat: bool
    n_layers: int
    params: str
    gated: bool


# ----- raw fetch + helpers -----------------------------------------------


def _format_params(num_params: int) -> str:
    """Format a raw parameter count as a compact human-readable string.

    Examples: ``124M``, ``7B``. Values below 1M are shown in thousands.
    """
    if num_params >= 1e9:
        return f"{num_params / 1e9:.0f}B"
    elif num_params >= 1e6:
        return f"{num_params / 1e6:.0f}M"
    else:
        return f"{num_params / 1e3:.0f}K"


def _get_param_count(model_name: str) -> int:
    """Return total parameter count from safetensors metadata headers.

    Does not download model weights — reads shard headers via the Hub API.
    """
    metadata = get_safetensors_metadata(model_name)
    return sum(int(v) for v in metadata.parameter_count.values())


def fetch_model_metadata(model_name: str) -> ModelMetadata:
    """Fetch and derive metadata for a HuggingFace model repo.

    Loads ``AutoConfig`` without ``trust_remote_code``, verifies the
    architecture is a standard causal LM, rejects vision/multimodal configs,
    and reads parameter count from safetensors headers.

    Args:
        model_name: HuggingFace repo ID.

    Returns:
        Populated ``ModelMetadata`` record.

    Raises:
        UnsupportedModel: If the repo is not a loadable text-only causal LM.
    """
    logger.info(f"Fetching metadata for {model_name}")

    # Load architecture from config WITHOUT trust_remote_code. A failure here
    # rules the model out as a standard text-to-text transformer for any of
    # the common reasons:
    #   - LoRA adapter repos (no config.json, just adapter_config.json)
    #   - Models requiring trust_remote_code (ValueError mentioning it)
    #   - Repos with no transformers-compatible config
    try:
        config = AutoConfig.from_pretrained(model_name, trust_remote_code=False)
    except Exception as e:
        raise UnsupportedModel(
            f"{model_name} is not a standard text-to-text transformer (config load failed: {e})"
        ) from e

    # Must be a model_type that `AutoModelForCausalLM` knows how to instantiate.
    # Using transformers' own registry instead of string-matching the
    # architectures field — GPT-2 et al. use `GPT2LMHeadModel` (no
    # "ForCausalLM" suffix) so suffix matching would wrongly exclude them.
    if config.model_type not in MODEL_FOR_CAUSAL_LM_MAPPING_NAMES:
        raise UnsupportedModel(
            f"{model_name} is not a causal LM (model_type: {config.model_type})"
        )

    # Defense in depth: some VLMs register a ForCausalLM head but still carry
    # a vision tower in the config (the LLM half of an LLaVA-style stack).
    # Reject those too — workbench can't drive them with text-only prompts.
    if (
        hasattr(config, "vision_config")
        or hasattr(config, "vision_tower")
        or hasattr(config, "image_token_index")
        or hasattr(config, "image_token_id")
        or getattr(config, "model_type", None) in VISION_MODEL_TYPES
    ):
        raise UnsupportedModel(f"{model_name} has a vision component ({config.model_type})")

    n_layers = getattr(config, "num_hidden_layers", None) or getattr(config, "n_layer", 0)

    # Parameter count from safetensors header (no weights download)
    try:
        num_params = _get_param_count(model_name)
    except Exception:
        logger.warning(f"Could not get safetensors metadata for {model_name}, params will show as unknown")
        num_params = 0

    # Workbench gating policy: models at or above the threshold are gated
    # (guests can't request them). Replaces HF Hub's gated field — workbench
    # uses this attribute as a workbench-side access control. Models we
    # couldn't size (num_params == 0) default to NOT gated since we don't
    # know if they're above the line.
    gated = num_params >= GATED_THRESHOLD_PARAMS

    return ModelMetadata(
        name=model_name,
        is_chat=_is_chat_model(model_name),
        n_layers=n_layers,
        params=_format_params(num_params) if num_params > 0 else "unknown",
        gated=gated,
    )


# ----- persisted cache ---------------------------------------------------


class MetadataCache:
    """Disk-backed registry of model metadata and unsupported-model verdicts.

    On construction, loads ``_metadata_cache.json`` (see ``METADATA_CACHE_PATH``).
    The file has two top-level keys:

    * ``metadata`` — repo ID → ``ModelMetadata`` fields
    * ``unsupported`` — list of repo IDs that failed supportability checks

    Every mutation (new metadata or new unsupported verdict) is persisted
    atomically via write-to-temp + ``os.replace``.

    Delete the cache file manually when schema or derivation rules change to
    force a full re-fetch on next startup.
    """

    def __init__(self, path: str = METADATA_CACHE_PATH):
        """Load the cache from ``path``, or start empty if the file is missing."""
        self.path = path
        self.metadata: dict[str, ModelMetadata] = {}
        self.unsupported: set[str] = set()
        self._load()

    def fetch_metadata(self, model_name: str) -> ModelMetadata:
        """Return metadata for ``model_name``, fetching and caching on first sight.

        Consults the in-memory cache and unsupported set, then falls through
        to ``fetch_model_metadata`` on a miss. Both positive and negative
        results are persisted before returning or raising.

        Args:
            model_name: HuggingFace repo ID.

        Returns:
            Cached or freshly fetched ``ModelMetadata``.

        Raises:
            UnsupportedModel: If the model was previously or newly identified
                as unsupported.
        """
        if model_name in self.unsupported:
            raise UnsupportedModel(f"{model_name} previously identified as unsupported")
        if model_name in self.metadata:
            return self.metadata[model_name]
        
        try:
            meta = fetch_model_metadata(model_name)
        except UnsupportedModel as e:
            logger.info(f"Skipping unsupported model: {e}")
            self.unsupported.add(model_name)
            self._save()
            raise
        
        self.metadata[model_name] = meta
        self._save()
        return meta

    def get(self, model_name: str) -> ModelMetadata | None:
        """Return cached metadata without fetching.

        Returns:
            The cached record, or ``None`` if ``model_name`` has not been
            successfully probed.
        """
        return self.metadata.get(model_name)

    def __contains__(self, model_name: str) -> bool:
        """Return whether ``model_name`` has cached (supported) metadata."""
        return model_name in self.metadata

    def all_dumped(self) -> list[dict]:
        """Return all cached metadata as plain dicts.

        Used by local-mode ``/models`` to list every model the backend knows
        about, regardless of NDIF deployment status.
        """
        return [m.model_dump() for m in self.metadata.values()]

    # ----- persistence -------------------------------------------------

    def _load(self) -> None:
        """Hydrate ``self.metadata`` and ``self.unsupported`` from disk.

        Malformed per-model entries are skipped with a warning. A missing or
        unreadable file leaves the cache empty.
        """
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r") as f:
                data = json.load(f)
            for name, raw in (data.get("metadata") or {}).items():
                try:
                    self.metadata[name] = ModelMetadata(**raw)
                except Exception as e:
                    logger.warning(f"Skipping malformed cached metadata for {name}: {e}")
            self.unsupported.update(data.get("unsupported") or [])
            logger.info(
                f"Loaded metadata cache from {self.path}: "
                f"{len(self.metadata)} models, {len(self.unsupported)} unsupported",
            )
        except Exception as e:
            logger.warning(f"Could not load metadata cache at {self.path}: {e}")

    def _save(self) -> None:
        """Atomically persist the current cache state to ``self.path``."""
        payload = {
            "metadata": {k: v.model_dump() for k, v in self.metadata.items()},
            "unsupported": sorted(self.unsupported),
        }
        tmp_path = self.path + ".tmp"
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(tmp_path, "w") as f:
                json.dump(payload, f, indent=2)
            os.replace(tmp_path, self.path)
        except Exception as e:
            logger.warning(f"Could not save metadata cache to {self.path}: {e}")
