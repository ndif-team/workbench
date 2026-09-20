from fastapi import APIRouter, Depends
from pydantic import BaseModel

from nnsightful.tools.j_lens import j_lens

from ..auth import require_user_email
from ..sse import stream_tool
from ..state import AppState, get_state

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
):
    """Run the Jacobian lens, streaming status until the data lands (see ``sse``)."""
    return stream_tool(
        state,
        j_lens,
        state[req.model],
        req.prompt,
        top_k=req.topk,
    )
