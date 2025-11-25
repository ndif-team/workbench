import json
import logging
import os
import tomllib
from collections import defaultdict
from typing import TYPE_CHECKING, Any, Dict, Optional

import toml
import torch
from fastapi import Request
from pydantic import TypeAdapter

from nnsight import CONFIG, LanguageModel
from nnsight.intervention.backends.remote import RemoteBackend

from .configs.app import Config
from .configs.tools import ToolType
from .telemetry import TelemetryClient

if TYPE_CHECKING:
    from .configs.models import ModelConfig


# Set up logger for this module
logger = logging.getLogger(__name__)

tool_adapter = TypeAdapter(ToolType)

PATH = os.path.dirname(os.path.abspath(__file__))

class AppState:
    def __init__(self):
        
        self.remote = self._load_backend_config()

        # Defaults
        self.models: dict[str, LanguageModel] = dict()
        # model_name -> tool_name -> data_name -> data
        self.tool_data: dict[str, dict[str, dict[str, Any]]] = defaultdict(lambda: defaultdict(dict))

        self.config = self._load_config()

        TelemetryClient.init(self)

    def add_model(self, model_name: str) -> Optional[Dict[str, Any]]:
        if model_name in self.config.models and model_name not in self.models:
            return self._load_model(model_name).to_dict()

    def remove_model(self, model_name: str) -> None:
        if model_name in self.models:
            del self.models[model_name]

        # clean up tool artifacts
        if model_name in self.tool_data:
            self.tool_data.pop(model_name)

    def get_model(self, model_name: str) -> LanguageModel:
        return self.models[model_name]

    def get_model_tool_data(self, model_name: str, tool_name: str) -> Optional[dict[str, Any]]:
        return self.tool_data.get(model_name, {}).get(tool_name, None)

    def get_config(self) -> Config:
        return self.config

    def get_model_configs(self):
        return [config for config in self.config.get_model_list() if config['name'] in self.models]
    
    def make_backend(self, model: LanguageModel | None = None, job_id: str | None = None):
        if self.remote:
            return RemoteBackend(
                job_id=job_id, blocking=False, model_key=model.to_model_key() if model is not None else None
            )
        else:
            return None
    
    def __getitem__(self, model_name: str):
        return self.get_model(model_name)

    def _load_backend_config(self) -> bool:

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

    def _load_config(self) -> Config:
        env = os.environ.get("ENVIRONMENT", "dev")
        logger.info(f'Loading "{env}" config')
        
        model_config_path = os.path.join(PATH, f"configs/_model_configs/{env}.toml")
        tool_config_path = os.path.join(PATH, f"configs/_tool_configs/{env}.toml")

        with open(model_config_path, "r") as f:
            model_config = toml.load(f)["models"]
            model_config = {model["name"]: model for model in model_config}

        with open(tool_config_path, "rb") as f:
            tool_config = [tool_adapter.validate_python(tool) for tool in tomllib.load(f)["tools"]]
        
        config = Config(models=model_config, tools=tool_config)

        # load models if remote execution is disabled
        if not self.remote:
            for model_name in model_config.keys():
                self._load_model(model_name)
        
        return config

    def _load_model(self, model_name: str) -> 'ModelConfig':
        logger.info(f"Loading model: {model_name}")

        model_config = self.config.models[model_name] 
        
        model = LanguageModel(
            model_config.name,
            rename=model_config.rename,
            device_map="auto",
            torch_dtype=torch.bfloat16,
            dispatch=not self.remote,
        )
        model.config.update(model_config.config)
        self.models[model_name] = model

        # load any data related to this model for any of the tools supported for it
        tool_config_path = os.path.join(PATH, f"configs/_tool_configs")
        for tool_config in self.config.tools:
            tool_model_config = tool_config.get_tool_model_config(model_name)
            if tool_model_config is not None:
                if tool_model_config.data_paths is not None:
                    for data_name, data_path in tool_model_config.data_paths.items():
                        with open(os.path.join(tool_config_path, data_path), "r") as f:
                            data = json.load(f)
                        self.tool_data[model_name][tool_config.name][data_name] = data

        return model_config

APP_STATE = AppState()

def get_state(request: Request):
    return APP_STATE