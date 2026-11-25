from fastapi import APIRouter, Request, Depends
from fastapi.responses import StreamingResponse
from typing import List, Optional, Union
from pydantic import BaseModel


from ..state import AppState
from ..auth import require_user_email
from ..state import get_state
from ..sse import ToolEventStream

from nnsightful.tools.activation_patching import activation_patching

router = APIRouter()

class ActivationPatchingRequest(BaseModel):
    """One activation-patching run.

    Attributes:
        patch: Which of a looped model's two patches to run: ``"state"``
            (everything a layer visit leaves) or ``"output"`` (what its layer
            returns). nnsightful's looped tool checks the value and defaults
            to ``"state"``. Leave it unset for any other model: their
            patching has one form and takes no such argument.
    """

    model_name: str
    src_prompt: str
    tgt_prompt: str
    src_pos: List[Union[int, List[int]]]
    tgt_pos: List[int]
    tgt_freeze: List[int] = []
    token_ids: List[int]
    patch: Optional[str] = None


@router.post("/run")
async def run_activation_patching(
    request: ActivationPatchingRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
) -> StreamingResponse:
    model = state[request.model_name]
    options = {} if request.patch is None else {"patch": request.patch}

    return ToolEventStream(
        activation_patching,
        model,
        request.src_prompt,
        request.tgt_prompt,
        request.src_pos,
        request.tgt_pos,
        request.tgt_freeze,
        remote=state.remote,
        **options,
    ).response()
