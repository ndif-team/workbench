from typing import List, Union

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from nnsightful.tools.activation_patching import activation_patching

from ..auth import require_user_email
from ..sse import MEDIA_TYPE, stream_backend, stream_value
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
    req: ActivationPatchingRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model_name]

    if not state.remote:
        data = activation_patching(
            model,
            req.src_prompt,
            req.tgt_prompt,
            req.src_pos,
            req.tgt_pos,
            req.tgt_freeze,
            remote=False,
        )
        return StreamingResponse(stream_value(data), media_type=MEDIA_TYPE)

    backend = state.make_streaming_backend(model=model)
    activation_patching._run(
        model,
        req.src_prompt,
        req.tgt_prompt,
        req.src_pos,
        req.tgt_pos,
        req.tgt_freeze,
        remote=True,
        backend=backend,
    )

    tokenizer = model.tokenizer

    def process(raw: dict):
        raw["tokenizer"] = tokenizer
        return activation_patching._format(raw)

    return StreamingResponse(stream_backend(backend, process), media_type=MEDIA_TYPE)
