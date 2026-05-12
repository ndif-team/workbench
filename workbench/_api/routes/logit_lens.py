from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..state import AppState, get_state
from ..auth import require_user_email

from ..data_models import NDIFResponse

from nnsightful.types import LogitLensData
from nnsightful.tools.logit_lens import logit_lens

router = APIRouter()

class LogitLensRequest(BaseModel):
    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data


class LogitLensResponse(NDIFResponse):
    data: LogitLensData | None = None


@router.post("/start", response_model=LogitLensResponse)
async def start_logit_lens(
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]
    backend = state.make_backend(model=model)

    output = logit_lens._run(model, req.prompt, remote=state.remote, backend=backend, non_blocking=state.remote, raw=False)

    if not backend.blocking:
        return {"job_id": output}


    return {"data": logit_lens.to_data_obj(**output)}


@router.post("/results/{job_id}", response_model=LogitLensResponse)
async def collect_logit_lens(
    job_id: str,
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()['results']

    data = logit_lens.to_data_obj(**results)

    return {"data": data}