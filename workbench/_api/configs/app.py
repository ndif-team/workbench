from pydantic import BaseModel

from .models import ModelConfig
from .tools import ToolConfig

class Config(BaseModel):
    """Root configuration containing all models and tools."""
    
    models: dict[str, ModelConfig]

    tools: list[ToolConfig]

    def get_model_list(self) -> list[dict[str, str]]:
        """Get list of models that are served and if they are chat or base."""
        return [
            model.to_dict()
            for model in self.models.values()
        ]

    def get_tool_list(self) -> list[dict[str, str]]:
        return [
            tool.to_dict()
            for tool in self.tools
        ]

    def get_model(self, model_name: str) -> ModelConfig:
        return self.models[model_name]