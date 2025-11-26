from fastapi import APIRouter, Depends

from ..auth import validate_user
from ..data_models.base import NDIFResponse
from ..data_models.tools.concept_lens import ConceptLensRequest
from ..data_models.visualizations.heatmap import HeatmapResponse
from ..src.tools.concept_lens import ConceptLens
from ..src.tools.metrics import Metrics
from ..state import APP_STATE
from .utils import fetch_job_results

router = APIRouter()

################ TOOL #####################

@router.post("/run")
async def concept_lens(
    request: ConceptLensRequest,
    user_email: str = Depends(validate_user),
) -> NDIFResponse:

    model = APP_STATE.get_model(request.model)
    concept_heads = ConceptLens.get_concept_heads(APP_STATE, request.model)

    job_id = ConceptLens.run(
        remote=APP_STATE.remote,
        model=model,
        prompt=request.prompt,
        concept_heads=concept_heads,
        token_position=request.token_position,
        backend=APP_STATE.make_backend(model=model),
    )

    return {"job_id": job_id}


######################## VISUALIZATIONS #########################

@router.post("/heatmap/{job_id}", response_model=HeatmapResponse)
async def heatmap(
    job_id: str,
    request: ConceptLensRequest,
    user_email: str = Depends(validate_user),
):

    model = APP_STATE.get_model(request.model)
    results = fetch_job_results(model, job_id)["results"]

    return ConceptLens.make_heatmap(model, results)
