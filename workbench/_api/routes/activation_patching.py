from typing import Any

from fastapi import APIRouter, Depends

from ..state import APP_STATE

from ..auth import validate_user

from ..data_models.base import NDIFResponse
from ..data_models.tools.activation_patching import ActivationPatchingRequest
from ..data_models.visualizations.line import LineResponse
from ..routes.utils import fetch_job_results

from ..src.tools.metrics import MetricFunction
from ..src.tools.activation_patching import ActivationPatching

router = APIRouter()

################ TOOL #####################

@router.post("/run")
async def activation_patching(
    request: ActivationPatchingRequest,
    user_email: str = Depends(validate_user),
) -> NDIFResponse:

    model = APP_STATE.get_model(request.model)

    job_id = ActivationPatching.run(
        model=model,
        src_prompt=request.src_prompt,
        src_position=request.src_position,
        trg_prompt=request.tgt_prompt,
        trg_position=request.tgt_position,
        metric_func=MetricFunction(request.metric),
        trg_ids=request.target_ids,
        remote=APP_STATE.remote,
        backend=APP_STATE.make_backend(model=model),
    )

    return {"job_id": job_id}


######################## VISUALIZATIONS #########################

@router.post("/line/{job_id}", response_model=LineResponse)
async def line(
    job_id: str,
    request: ActivationPatchingRequest,
    user_email: str = Depends(validate_user),
):

    model = APP_STATE.get_model(request.model)
    results = fetch_job_results(model, job_id)["results"]

    return ActivationPatching.make_line(model, request.target_ids, results)
