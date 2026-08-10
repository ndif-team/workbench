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
    topk: int = 5
    include_entropy: bool = True  # Whether to include entropy data
    max_new_tokens: int = 1
    # Sampling Params
    temperature: float | None = None
    top_p: float | None = None
    top_k: int | None = None


def _generate_kwargs(req: JLensRequest) -> dict:
    """Build the optional sampling kwargs forwarded to ``model.generate(...)`` via
    the tool's ``generate_kwargs``. Mirrors the /generate route: only keys the
    caller set are included, and setting any of temperature/top_p/top_k flips
    ``do_sample`` on (transformers' standard behavior)."""
    kwargs: dict = {}
    sample = False
    if req.temperature is not None:
        kwargs["temperature"] = req.temperature
        sample = True
    if req.top_p is not None:
        kwargs["top_p"] = req.top_p
        sample = True
    if req.top_k is not None:
        kwargs["top_k"] = req.top_k
        sample = True
    if sample:
        kwargs["do_sample"] = True
    return kwargs


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

    output = j_lens._run(
        model,
        req.prompt,
        remote=state.remote,
        backend=backend,
        non_blocking=state.remote,
        raw=False,
        max_new_tokens=req.max_new_tokens,
        generate_kwargs=_generate_kwargs(req),
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )

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
