from pydantic import BaseModel, Field
from typing import Optional

class ConceptLensRequest(BaseModel):
    model: str
    prompt: str
    token_position: Optional[int] = Field(None, alias="tokenPosition")
