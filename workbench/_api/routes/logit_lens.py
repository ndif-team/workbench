from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..state import AppState, get_state
from ..auth import require_user_email
from ..sse import ToolEventStream

from nnsightful.tools.logit_lens import logit_lens

router = APIRouter()

class LogitLensRequest(BaseModel):
    """One logit-lens run.

    Attributes:
        lens: How a looped model's layer visits are read: ``"logit"`` or
            ``"coda"``. nnsightful's looped tool checks the value and defaults
            to ``"logit"``. Leave it unset for any other model: their lens
            has one form and takes no such argument.
    """

    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data
    lens: Optional[str] = None


@router.post("/run")
async def run_logit_lens(
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
) -> StreamingResponse:
    model = state[req.model]

    options = {} if req.lens is None else {"lens": req.lens}
    return ToolEventStream(
        logit_lens, model, req.prompt, remote=state.remote, top_k=req.topk, **options
    ).response()
