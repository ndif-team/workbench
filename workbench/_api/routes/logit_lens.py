from fastapi import APIRouter, Depends

from ..auth import validate_user

from ..data_models.base import NDIFResponse
from ..data_models.tools.logit_lens import LogitLensRequest
from ..data_models.tools.metrics import Metrics
from ..data_models.visualizations.heatmap import HeatmapResponse
from ..data_models.visualizations.line import LineResponse

from ..routes.utils import fetch_job_results

from ..src.tools.logit_lens import LogitLens
from ..src.tools.metrics import MetricFunction

from ..state import APP_STATE

router = APIRouter()

################ TOOL #####################

@router.post("/run")
async def logit_lens(
    request: LogitLensRequest,
) -> NDIFResponse:

    model = APP_STATE.get_model(request.model)

    use_top_pred_as_target_ids = request.metric == Metrics.RANK and request.target_ids is None

    if request.metric == Metrics.ENTROPY:
        top_k = 0
    else:
        top_k = 1

    job_id = LogitLens.run(
        remote=APP_STATE.remote,
        model=model,
        prompt=request.prompt,
        metric_func=MetricFunction(request.metric),
        token_position=request.token_position,
        target_ids=request.target_ids,
        use_top_pred_as_target_ids=use_top_pred_as_target_ids,
        top_k=top_k,
        backend=APP_STATE.make_backend(model=model),
    )

    return {"job_id": job_id}


######################## VISUALIZATIONS #########################

@router.post("/heatmap/{job_id}", response_model=HeatmapResponse)
async def heatmap(
    job_id: str,
    request: LogitLensRequest,
    user_email: str = Depends(validate_user),
):

    model = APP_STATE.get_model(request.model)
    results = fetch_job_results(model, job_id)["results"]

    return LogitLens.make_heatmap(model, request.prompt, results, request.metric)


@router.post("/line/{job_id}", response_model=LineResponse)
async def line(
    job_id: str,
    request: LogitLensRequest,
    user_email: str = Depends(validate_user),
):

    model = APP_STATE.get_model(request.model)
    results = fetch_job_results(model, job_id)["results"]

    return LogitLens.make_line(model, request.target_ids, results)
