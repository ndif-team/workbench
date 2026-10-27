from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..state import AppState, get_state
from ..auth import require_user_email
from ..sse import ToolEventStream

from nnsightful.tools.j_lens import j_lens

router = APIRouter()

class JLensRequest(BaseModel):
    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data


@router.post("/run")
async def run_j_lens(
    req: JLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
) -> StreamingResponse:
    model = state[req.model]

    return ToolEventStream(j_lens, model, req.prompt, remote=state.remote, top_k=req.topk).response()
