from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from typing import List, Union
from pydantic import BaseModel


from ..state import AppState
from ..auth import require_user_email
from ..state import get_state
from ..sse import ToolEventStream

from nnsightful.tools.activation_patching import activation_patching

router = APIRouter()

class ActivationPatchingRequest(BaseModel):
    model_name: str
    src_prompt: str
    tgt_prompt: str
    src_pos: List[Union[int, List[int]]]
    tgt_pos: List[int]
    tgt_freeze: List[int] = []
    token_ids: List[int]


@router.post("/run")
async def run_activation_patching(
    request: ActivationPatchingRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
) -> StreamingResponse:
    model = state[request.model_name]

    return ToolEventStream(
        activation_patching,
        model,
        request.src_prompt,
        request.tgt_prompt,
        request.src_pos,
        request.tgt_pos,
        request.tgt_freeze,
        remote=state.remote,
    ).response()
