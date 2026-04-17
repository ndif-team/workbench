from fastapi import APIRouter, Request, Depends
from typing import List, Union
from pydantic import BaseModel

from ..data_models import NDIFResponse


from ..state import AppState
from ..auth import require_user_email
from ..state import get_state

from nnsightful.types import ActivationPatchingData
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

class ActivationPatchingResponse(NDIFResponse):
    data: ActivationPatchingData | None = None


@router.post("/start", response_model=ActivationPatchingResponse)
async def start_activation_patching(
    request: ActivationPatchingRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[request.model_name]
    backend = state.make_backend(model=model)

    raw = activation_patching._run(
        model,
        request.src_prompt,
        request.tgt_prompt,
        request.src_pos,
        request.tgt_pos,
        request.tgt_freeze,
        remote=state.remote,
        backend=backend,
    )

    if "job_id" in raw:
        return {"job_id": raw["job_id"]}

    data = activation_patching._format(raw)
    return {"data": data}


@router.post("/results/{job_id}", response_model=ActivationPatchingResponse)
async def collect_results(
    job_id: str,
    request: ActivationPatchingRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()

    results["tokenizer"] = state[request.model_name].tokenizer

    data = activation_patching._format(results)

    return {"data": data}