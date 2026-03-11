from fastapi import APIRouter, Request, Depends
from typing import List, Union
from pydantic import BaseModel

from ..data_models import NDIFResponse


from ..state import AppState
from ..auth import require_user_email
from ..state import get_state

from nnsightful.types import ActivationPatchingData
from nnsightful.tools.activation_patching import activation_patching, format_data

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
    job_id = activation_patching(model, request.src_prompt, request.tgt_prompt, request.src_pos, request.tgt_pos, request.tgt_freeze, state.make_backend(model=model), state.remote)
    return {"job_id": job_id}

@router.post("/results/{job_id}", response_model=ActivationPatchingResponse)
async def collect_results(
    job_id: str, 
    request: ActivationPatchingRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()
    logits = results["patched_logits_per_layer"]
    src_pred = results["src_pred"].item()
    clean_pred = results["clean_pred"].item()
    clean_logits = results["clean_logits"]
    
    data = format_data(state[request.model_name].tokenizer, src_pred, clean_pred, logits, clean_logits)
    return {"data": data}