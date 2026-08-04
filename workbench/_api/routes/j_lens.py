from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..state import AppState, get_state
from ..auth import require_user_email

from ..data_models import NDIFResponse

from nnsightful.types import JLensData
from nnsightful.tools.j_lens import j_lens

router = APIRouter()

class JLensRequest(BaseModel):
    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data


class JLensResponse(NDIFResponse):
    data: JLensData | None = None


@router.post("/start", response_model=JLensResponse)
async def start_j_lens(
    req: JLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]
    backend = state.make_backend(model=model)

    output = j_lens._run(model, req.prompt, remote=state.remote, backend=backend, non_blocking=state.remote, raw=False, top_k=req.topk)

    if not backend.blocking:
        return {"job_id": output}


    return {"data": j_lens.to_data_obj(**output)}


@router.post("/results/{job_id}", response_model=JLensResponse)
async def collect_j_lens(
    job_id: str,
    req: JLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()['results']

    data = j_lens.to_data_obj(**results)

    return {"data": data}
