from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..state import AppState, get_state
from ..auth import require_user_email
from ..sse import ToolEventStream
from ..tool_options import ToolOptions

from nnsightful.tools.logit_lens import logit_lens

router = APIRouter()

class LogitLensRequest(BaseModel):
    """One logit-lens run.

    Attributes:
        options: The options the lens takes on this model, by name
            (``ToolOptions``): a looped model's ``lens``. One left out runs at
            its default. Empty for a model whose lens takes none.
    """

    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data
    options: dict[str, str] = {}


@router.post("/run")
async def run_logit_lens(
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
) -> StreamingResponse:
    model = state[req.model]

    options = ToolOptions.picked(logit_lens, model, req.options)
    return ToolEventStream(
        logit_lens, model, req.prompt, remote=state.remote, top_k=req.topk, **options
    ).response()
