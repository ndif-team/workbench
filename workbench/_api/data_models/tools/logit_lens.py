from typing import List, Optional

from pydantic import BaseModel, Field

from .metrics import Metrics


class LogitLensRequest(BaseModel):
    model: str
    prompt: str
    metric: Metrics
    token_position: Optional[int] = Field(None, alias="tokenPosition")
    target_ids: Optional[List[int]] = Field(None, alias="targetIds")
