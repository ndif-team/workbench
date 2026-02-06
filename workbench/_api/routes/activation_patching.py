from fastapi import APIRouter, Request, Depends
from typing import List
from pydantic import BaseModel

from ..data_models import NDIFResponse


from ..state import AppState
from ..auth import require_user_email
from ..state import get_state

from workbench.interp_tools.src.visualizations.types import ActivationPatchingData
from workbench.interp_tools.src.tools.activation_patching import activation_patching, format_data

router = APIRouter()

class ActivationPatchingRequest(BaseModel):
    model_name: str
    src_prompt: str
    tgt_prompt: str
    src_pos: int
    tgt_pos: int
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
    job_id = activation_patching(model, request.src_prompt, request.tgt_prompt, request.src_pos, request.tgt_pos, state.make_backend(model=model), state.remote)
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
    src_pred = results["src_pred"]
    clean_pred = results["clean_pred"]

    token_ids = list([src_pred, clean_pred])

    data = format_data(logits, token_ids)
    return {"data": data}