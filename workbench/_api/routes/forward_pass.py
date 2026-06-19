import logging
from typing import Literal

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from nnsightful.tools.forward_pass import forward_pass
from nnsightful.types import ForwardPassData

from ..auth import require_user_email
from ..data_models import NDIFResponse
from ..state import AppState, get_state


logger = logging.getLogger(__name__)

router = APIRouter()


class ForwardPassRequest(BaseModel):
    model: str
    prompt: str
    positions: list[int] | Literal["all"] = [-1]
    top_k: int = 10


class ForwardPassResponse(NDIFResponse):
    data: ForwardPassData | None = None


@router.post("/start", response_model=ForwardPassResponse)
async def start_forward_pass(
    req: ForwardPassRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]
    backend = state.make_backend(model=model)

    output = forward_pass._run(
        model,
        req.prompt,
        positions=req.positions,
        top_k=req.top_k,
        remote=state.remote,
        backend=backend,
        non_blocking=state.remote,
        raw=False,
    )

    if state.remote and backend is not None and not getattr(backend, "blocking", False):
        return {"job_id": output}

    return {"data": forward_pass.to_data_obj(**output)}


@router.post("/results/{job_id}", response_model=ForwardPassResponse)
async def collect_forward_pass(
    job_id: str,
    req: ForwardPassRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()["results"]
    data = forward_pass.to_data_obj(**results)
    return {"data": data}


class JobStatusResponse(BaseModel):
    status: str
    description: str | None = None


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def job_status(
    job_id: str,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    """Proxy NDIF job status so the browser never sees the NDIF API key."""
    if not state.remote:
        # Local mode runs synchronously; if a client polls in local mode, just
        # report COMPLETED — by the time the start endpoint returned, the work
        # was already done.
        return {"status": "COMPLETED", "description": "local mode is synchronous"}
    try:
        resp = requests.get(
            f"{state.ndif_backend_url}/response/{job_id}",
            timeout=10,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"NDIF status returned {resp.status_code}")
        payload = resp.json()
        status_value = payload.get("status", "UNKNOWN")
        description = payload.get("description") or payload.get("msg")
        return {"status": status_value, "description": description}
    except requests.RequestException as exc:
        logger.warning(f"forward_pass status proxy failed for {job_id}: {exc}")
        raise HTTPException(status_code=502, detail="NDIF status unreachable")
