from typing import List, Union

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from nnsightful.tools.activation_patching import activation_patching

from ..auth import require_user_email
from ..sse import stream_tool
from ..state import AppState, get_state

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
):
    """Run activation patching, streaming status until the data lands (see ``sse``)."""
    return stream_tool(
        state,
        activation_patching,
        state[request.model_name],
        request.src_prompt,
        request.tgt_prompt,
        request.src_pos,
        request.tgt_pos,
        request.tgt_freeze,
    )
