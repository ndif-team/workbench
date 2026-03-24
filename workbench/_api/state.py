import logging
import os
import torch
import toml
from fastapi import Request

from huggingface_hub import model_info, get_safetensors_metadata
from transformers import AutoConfig, AutoTokenizer

from nnsight import CONFIG
from nnterp import StandardizedTransformer
from nnsight.intervention.backends.remote import RemoteBackend
from pydantic import BaseModel

from .telemetry import TelemetryClient

# Set up logger for this module
logger = logging.getLogger(__name__)


def _format_params(num_params: int) -> str:
    """Format parameter count to human-readable string (e.g. '124M', '7B')."""
    if num_params >= 1e9:
        return f"{num_params / 1e9:.0f}B"
    elif num_params >= 1e6:
        return f"{num_params / 1e6:.0f}M"
    else:
        return f"{num_params / 1e3:.0f}K"


def _get_param_count(model_name: str) -> int:
    """Get parameter count from safetensors metadata (header-only, no weight download)."""
    metadata = get_safetensors_metadata(model_name)
    return sum(int(v) for v in metadata.parameter_count.values())


def fetch_model_metadata(model_name: str) -> "ModelMetadata":
    """Derive model metadata from HuggingFace Hub, AutoConfig, and safetensors headers."""
    logger.info(f"Fetching metadata for {model_name}")

    # Gated status from HF Hub
    try:
        info = model_info(model_name)
        gated = info.gated is not None and info.gated is not False
    except Exception:
        logger.warning(f"Could not fetch Hub info for {model_name}, assuming not gated")
        gated = False

    # Architecture info from config (no weights download)
    config = AutoConfig.from_pretrained(model_name)
    n_layers = getattr(config, "num_hidden_layers", None) or getattr(config, "n_layer", 0)

    # Parameter count from safetensors header (no weights download)
    try:
        num_params = _get_param_count(model_name)
    except Exception:
        logger.warning(f"Could not get safetensors metadata for {model_name}, params will show as unknown")
        num_params = 0

    # Chat template from tokenizer
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        is_chat = tokenizer.chat_template is not None
    except Exception:
        logger.warning(f"Could not load tokenizer for {model_name}, assuming base model")
        is_chat = False

    return ModelMetadata(
        name=model_name,
        is_chat=is_chat,
        n_layers=n_layers,
        params=_format_params(num_params) if num_params > 0 else "unknown",
        gated=gated,
    )


class ModelMetadata(BaseModel):
    """Auto-derived metadata for a model."""

    name: str
    is_chat: bool
    n_layers: int
    params: str
    gated: bool


class ModelsConfig(BaseModel):
    """Root configuration containing model names."""

    remote: bool
    models: list[str]

class AppState:
    def __init__(self):

        self.remote = self._load_backend_config()

        # Defaults
        self.models: dict[str, StandardizedTransformer] = {}
        self.model_metadata: dict[str, ModelMetadata] = {}

        self.config = self._load()

        # TelemetryClient.init(self)

    def add_model(self, model_name: str) -> dict | None:
        if model_name in self.config.models and model_name not in self.models:
            self._load_model(model_name)
            return self.model_metadata[model_name].model_dump()

    def remove_model(self, model_name: str):
        if model_name in self.models:
            del self.models[model_name]

    def get_model(self, model_name: str) -> StandardizedTransformer:
        return self.models[model_name]

    def get_model_metadata(self, model_name: str) -> ModelMetadata:
        return self.model_metadata[model_name]

    def get_active_model_list(self) -> list[dict]:
        return [
            self.model_metadata[name].model_dump()
            for name in self.models
            if name in self.model_metadata
        ]

    def get_all_model_list(self) -> list[dict]:
        return [meta.model_dump() for meta in self.model_metadata.values()]

    def make_backend(self, model: StandardizedTransformer | None = None, job_id: str | None = None):
        if self.remote:
            return RemoteBackend(
                job_id=job_id, blocking=False, model_key=model.to_model_key() if model is not None else None
            )
        else:
            return None

    def __getitem__(self, model_name: str):
        return self.get_model(model_name)

    def _load_backend_config(self):

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

    def _ensure_metadata(self, model_name: str) -> ModelMetadata:
        """Fetch and cache metadata for a model on first access."""
        if model_name not in self.model_metadata:
            self.model_metadata[model_name] = fetch_model_metadata(model_name)
        return self.model_metadata[model_name]

    def _load(self):
        env = os.environ.get("CONFIG", "dev")
        logger.info(f'Loading "{env}" config')

        current_path = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_path, f"_model_configs/{env}.toml")

        with open(config_path, "r") as f:
            config = ModelsConfig(**toml.load(f))

        if not self.remote:
            for model_name in config.models:
                self._ensure_metadata(model_name)
                model = StandardizedTransformer(
                    model_name,
                    device_map="auto",
                    torch_dtype=torch.bfloat16,
                    remote=self.remote,
                )
                self.models[model_name] = model
        return config

    def _load_model(self, model_name: str):
        logger.info(f"Loading model: {model_name}")

        self._ensure_metadata(model_name)

        model = StandardizedTransformer(
            model_name,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            remote=False,
            allow_dispatch=not self.remote,
            check_renaming=not self.remote,
        )
        self.models[model_name] = model

def get_state(request: Request):
    return request.app.state.m
