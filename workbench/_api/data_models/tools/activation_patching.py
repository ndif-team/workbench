from typing import List, Optional

from pydantic import BaseModel, Field

from .metrics import Metrics


class ActivationPatchingRequest(BaseModel):
    model: str
    src_prompt: str = Field(alias="srcPrompt")
    src_position: int = Field(alias="srcPosition")
    tgt_prompt: str = Field(alias="tgtPrompt")
    tgt_position: int = Field(alias="tgtPosition")
    metric: Metrics
    target_ids: Optional[List[int]] = Field(None, alias="targetIds")