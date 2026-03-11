from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..state import AppState, get_state
from ..auth import require_user_email

from ..data_models import NDIFResponse

from nnsightful.types import LogitLensData
from nnsightful.tools.logit_lens import logit_lens, format_data

router = APIRouter()

class LogitLensRequest(BaseModel):
    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data


class LogitLensResponse(NDIFResponse):
    data: LogitLensData | None = None


@router.post("/start", response_model=LogitLensResponse)
async def start_lens2(
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):

    model = state[req.model]
    backend = state.make_backend(model=model)

    job_id = logit_lens(req.prompt, model, state.remote, backend)

    return {"job_id": job_id}


@router.post("/results/{job_id}", response_model=LogitLensResponse)
async def collect_lens2(
    job_id: str,
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    
    backend = state.make_backend(job_id=job_id)

    tokenizer = state[req.model].tokenizer

    results = backend()

    results = format_data(results["input_tokens"], results["all_logits"], tokenizer, req.topk, req.include_entropy, req.model)

    return {"data": results}