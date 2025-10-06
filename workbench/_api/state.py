import logging
import os
import torch
import toml
from fastapi import Request

from nnsight import LanguageModel, CONFIG
from nnsight.intervention.backends.remote import RemoteBackend
from pydantic import BaseModel

# Set up logger for this module
logger = logging.getLogger(__name__)

class ModelConfig(BaseModel):
    """Configuration for an individual model."""

    name: str
    chat: bool
    gated: bool
    rename: dict[str, str]
    config: dict[str, int | str]

class ModelsConfig(BaseModel):
    """Root configuration containing all models."""

    remote: bool
    
    models: dict[str, ModelConfig]

    def get_model_list(self) -> list[dict[str, str]]:
        """Get list of models that are served and if they are chat or base."""
        return [
            {
                "name": model.name,
                "type": "chat" if model.chat else "base",
                "n_layers" : model.config["n_layers"],
                "gated": model.gated,
            }
            for model in self.models.values()
        ]

class AppState:
    def __init__(self):
        
        self.remote = self._load_backend_config()

        # Defaults
        self.models: dict[str, LanguageModel] = {}

        self.config = self._load()

    def get_model(self, model_name: str):
        return self.models[model_name]

    def get_config(self):
        return self.config
    
    def make_backend(self, model: LanguageModel | None = None, job_id: str | None = None):
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
                CONFIG.API.SSL = False
            else:
                CONFIG.API.HOST = "api.ndif.us"
                CONFIG.API.SSL = True

        CONFIG.set_default_api_key(os.environ.get("NDIF_API_KEY"))

        self.ndif_backend_url = f"http{'s' if CONFIG.API.SSL else ''}://{CONFIG.API.HOST}"
        logger.info(f"Backend URL: {self.ndif_backend_url}")
        self.telemetry_url = f"http://{CONFIG.API.HOST.split(':')[0]}:{os.environ.get('INFLUXDB_PORT', '8086')}"
        logger.info(f"Telemetry URL: {self.telemetry_url}")

        return remote

    def _load(self):
        env = os.environ.get("ENVIRONMENT", "dev")
        logger.info(f'Loading "{env}" config')
        
        current_path = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(current_path, f"_model_configs/{env}.toml")

        with open(config_path, "r") as f:
            config = ModelsConfig(**toml.load(f))

        # self.remote = config.remote

        for _, cfg in config.models.items():
            model = LanguageModel(
                cfg.name,
                rename=cfg.rename,
                device_map="auto",
                torch_dtype=torch.bfloat16,
                dispatch=not self.remote,
            )

            model.config.update(cfg.config)
            self.models[cfg.name] = model

        return config

def get_state(request: Request):
    return request.app.state.m