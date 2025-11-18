from typing import Optional, Annotated, Union, Literal

from pydantic import BaseModel, Field

################### TOOL CONFIGS ###################

class ToolModelConfig(BaseModel):
    model_name: str
    data_paths: Optional[dict[str, str]] = None

    def to_dict(self):
        return {
            "model_name": self.model_name,
        }

class ToolConfig(BaseModel):
    name: str
    models: list[ToolModelConfig] = list()

    def to_dict(self):
        return {
            "name": self.name,
            "models": [model.to_dict() for model in self.models]
        }

    def get_tool_model_config(self, model_name: str) -> Optional[ToolModelConfig]:
        for model in self.models:
            if model.model_name == model_name:
                return model
        return None

################### LOGIT LENS ###################

class LogitLens(ToolConfig):
    type: Literal["LogitLens"]
    pass

################### CONCEPT LENS ###################

class ConceptLensModelConfig(ToolModelConfig):
    n_concept_heads: int

    def to_dict(self):
        return {
            "model_name": self.model_name,
            "n_concept_heads": self.n_concept_heads
        }

class ConceptLens(ToolConfig):
    type: Literal["ConceptLens"]
    models: list[ConceptLensModelConfig]

#################################################

ToolType = Annotated[Union[ConceptLens, LogitLens], Field(discriminator="type")]