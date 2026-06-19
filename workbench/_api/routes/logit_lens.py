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

    # Forward the request's top_k / include_entropy into the tool. `_run`
    # threads **kwargs through to its internal `format(...)`, which otherwise
    # falls back to top_k=5 — so without this the UI's topk is silently ignored.
    output = logit_lens._run(
        model,
        req.prompt,
        remote=state.remote,
        backend=backend,
        non_blocking=state.remote,
        raw=False,
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )

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