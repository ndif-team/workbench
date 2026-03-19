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

    raw = logit_lens._run(model, req.prompt, remote=state.remote, backend=backend)

    if "job_id" in raw:
        return {"job_id": raw["job_id"]}

    data = logit_lens._format(
        raw,
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )
    return {"data": data}


@router.post("/results/{job_id}", response_model=LogitLensResponse)
async def collect_logit_lens(
    job_id: str,
    req: LogitLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()

    print("logit_lens collect keys:", list(results.keys()) if isinstance(results, dict) else type(results))

    tokenizer = state[req.model].tokenizer
    results["tokenizer"] = tokenizer
    results["model_name"] = req.model
    results["input_tokens"] = [
        str(tokenizer.decode(token))
        for token in tokenizer.encode(req.prompt)
    ]

    data = logit_lens._format(
        results,
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )

    return {"data": data}