from pydantic import BaseModel

class ModelConfig(BaseModel):
    """Configuration for an individual model."""

    name: str
    chat: bool
    gated: bool
    rename: dict[str, str]
    config: dict[str, int | str]

    def to_dict(self) -> dict[str, str | bool | dict[str, int | str]]:
        return {
            "name": self.name,
            "type": "chat" if self.chat else "base",
            "gated": self.gated,
            "n_layers" : self.config["n_layers"],
            "params" : self.config["params"],
        }