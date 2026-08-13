import logging
import time

import requests
import torch as t
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from nnsightful.tools.j_lens import j_lens

from ..auth import get_user_email, require_user_email, user_has_model_access
from ..data_models import Token, ModelHeat
from ..sse import HEADERS, MEDIA_TYPE, stream_backend, stream_value
from ..telemetry import TelemetryClient, RequestStatus
from ..state import AppState, get_state

logger = logging.getLogger(__name__)

router = APIRouter()

MODELS_LAST_UPDATED = 0
MODEL_INTERVAL = 30


def _refresh_catalog(state: AppState) -> None:
    """Hit NDIF /status and rebuild the catalog of deployed models. Caches
    metadata for any model we haven't seen before; non-pinned models that
    fell out of the deployment set get unloaded (pinned ones stay loaded)."""
    
    ping_resp = requests.get(f"{state.ndif_backend_url}/ping", timeout=30)
    logger.info(f"Call NDIF_BACKEND/ping: {ping_resp.status_code}")
    if ping_resp.status_code != 200:
        raise HTTPException(status_code=500, detail="NDIF backend is not responding")

    status_resp = requests.get(f"{state.ndif_backend_url}/status", timeout=30)
    logger.info(f"Call NDIF_BACKEND/status: {status_resp.status_code}")
    if status_resp.status_code != 200:
        raise HTTPException(status_code=500, detail="Failed to fetch NDIF backend status")

    data = status_resp.json()

    # Pass 1: figure out which models NDIF currently serves, their heat, and
    # whether each is pinned (per NDIF deployment_state — not config).
    model_roster: dict[str, tuple[ModelHeat, bool]] = {}
    for deployment_state in data["deployments"].values():
        if deployment_state == {"application_state": "UNHEALTHY"}:
            continue

        repo_id = deployment_state.get("repo_id")
        level = deployment_state.get("deployment_level")
        app_state = deployment_state.get("application_state")
        pinned = app_state == "RUNNING" and bool(deployment_state.get("pinned"))

        if not repo_id:
            continue

        # A replica whose application is mid-load surfaces as DEPLOYING
        # regardless of its reported deployment_level, so the UI can show it
        # warming up. Otherwise fall back to the deployment heat level.
        if app_state == "DEPLOYING":
            heat = ModelHeat.DEPLOYING
        elif level in {"HOT", "WARM", "COLD"}:
            heat = ModelHeat(level.lower())
        else:
            continue
        if repo_id not in model_roster:
            model_roster[repo_id] = (heat, pinned)
        else:
            existing_heat, existing_pinned = model_roster[repo_id]
            model_roster[repo_id] = (
                ModelHeat.hotter(heat, existing_heat),
                pinned or existing_pinned,
            )

    # Pass 2: drop any catalog entries NDIF no longer serves.
    for stale in list(state.catalog.keys()):
        if stale not in model_roster:
            state.deregister_catalog_entry(stale)

    # Pass 3: register everything NDIF currently serves. register_catalog_entry
    # caches metadata on first sight, no-op for already-known models.
    for repo_id, (heat, pinned) in model_roster.items():
        state.register_catalog_entry(repo_id, heat, pinned=pinned)


def get_remote_models(state: AppState, is_user_signed_in: bool):
    global MODELS_LAST_UPDATED

    if MODELS_LAST_UPDATED == 0 or time.time() - MODELS_LAST_UPDATED > MODEL_INTERVAL:
        _refresh_catalog(state)
        MODELS_LAST_UPDATED = time.time()

    models = [model.copy() for model in state.get_catalog()]
    for model in models:
        if not is_user_signed_in and model["gated"]:
            model["allowed"] = False
        else:
            model["allowed"] = True
    return models

@router.get("/")
async def get_models(
    state: AppState = Depends(get_state),
    user_email: str = Depends(get_user_email),
):
    if state.remote:
        is_user_signed_in: bool = user_email is not None and user_email != "guest@localhost"
        models = get_remote_models(state, is_user_signed_in)
    else:
        models = state.get_all_model_list()
        # Local models are fully loaded on the dev backend, so they're effectively hot.
        for model in models:
            model['status'] = ModelHeat.HOT.value
        
    ## JLens supported models
    try:
        lens_models = j_lens.get_available_lenses()
        for model in models:
            name = model.get("name", "")
            model["has_jacobian"] = name.rsplit("/", 1)[-1] in lens_models
    except Exception as e:
        logger.warning(f"Failed to fetch Jacobian lens availability: {e}")

    return models


def _stream_trace(
    state: AppState,
    user_email: str,
    *,
    model: str,
    method: str,
    run,
    process,
):
    """Access-check a trace, run it, and stream it — what both model routes do.

    ``run`` returns the backend to stream (remote) or the saved values themselves
    (local); ``process`` turns saved values into the client's payload. Telemetry
    brackets the whole thing.

    The access check raises rather than streaming a failure, because nothing has
    been sent yet: a 403 is still a 403. Once ``run`` has submitted, every later
    failure reaches the client as an `error` frame instead (see ``sse``).
    """
    if state.remote and not user_has_model_access(user_email, model, state):
        message = f"User does not have access to {model}"
        TelemetryClient.log_request(
            RequestStatus.ERROR, user_email, method=method, type="NEXT_TOKEN", msg=message,
        )
        raise HTTPException(status_code=403, detail=message)

    TelemetryClient.log_request(
        RequestStatus.STARTED, user_email, method=method, type="NEXT_TOKEN",
    )

    try:
        result = run()
    except Exception as error:
        TelemetryClient.log_request(
            RequestStatus.ERROR, user_email, method=method, type="NEXT_TOKEN", msg=str(error),
        )
        raise

    def finish(saves: dict):
        data = process(saves)
        TelemetryClient.log_request(
            RequestStatus.COMPLETE, user_email, method=method, type="NEXT_TOKEN",
        )
        return data

    if not state.remote:
        return StreamingResponse(
            stream_value(finish(result)), media_type=MEDIA_TYPE, headers=HEADERS
        )

    # No job id to log: it belonged to the poll-and-collect flow, and the async
    # backend never surfaces one. If telemetry is switched back on and the
    # correlation matters, take it from the first status update.
    TelemetryClient.log_request(
        RequestStatus.READY, user_email, method=method, type="NEXT_TOKEN",
    )
    return StreamingResponse(
        stream_backend(result, finish), media_type=MEDIA_TYPE, headers=HEADERS
    )


class LensCompletion(BaseModel):
    model: str
    prompt: str
    token: Token


def prediction(req: LensCompletion, state: AppState):
    """Trace the model for the next-token distribution at the requested position.

    Returns the backend to stream when remote, and the saved values themselves
    when local — the two things a route can go on to do. Either way what reaches
    ``process_prediction`` is the same dict, keyed as it is saved here, because
    that is how NDIF hands the values back.
    """
    model = state[req.model]
    idx = req.token.idx
    backend = state.make_backend(model)

    with model.trace(req.prompt, remote=state.remote, backend=backend):
        logits_BLV = model.logits

        # Get logits for the correct index
        logits_LV = logits_BLV[0, [idx], :].softmax(dim=-1)

        # Sort logits by descending probability
        values_LV_indices_LV = t.sort(logits_LV, dim=-1, descending=True)

        values_LV = values_LV_indices_LV[0].save()
        indices_LV = values_LV_indices_LV[1].save()

    if state.remote:
        return backend

    return {"values_LV": values_LV, "indices_LV": indices_LV}


class Prediction(BaseModel):
    idx: int
    ids: list[int]
    probs: list[float]
    texts: list[str]


def process_prediction(saves: dict, req: LensCompletion, state: AppState):
    """Turn the trace's saved values into the client's `Prediction`."""
    values_LV, indices_LV = saves["values_LV"], saves["indices_LV"]
    tok = state[req.model].tokenizer
    idxs = [req.token.idx]

    # Round values to 2 decimal places
    idx_values = t.round(values_LV[0] * 100) / 100
    nonzero = idx_values > 0

    nonzero_values = idx_values[nonzero].tolist()
    nonzero_indices = indices_LV[0][nonzero].tolist()
    nonzero_texts = tok.batch_decode(nonzero_indices)

    prediction = Prediction(
        idx=idxs[0],
        ids=nonzero_indices,
        probs=nonzero_values,
        texts=nonzero_texts,
    )

    return prediction


@router.post("/run-prediction")
async def run_prediction(
    prediction_request: LensCompletion,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):
    """Next-token distribution at one position, streamed (see ``sse``)."""
    return _stream_trace(
        state,
        user_email,
        model=prediction_request.model,
        method="PREDICTION",
        run=lambda: prediction(prediction_request, state),
        process=lambda saves: process_prediction(saves, prediction_request, state),
    )


class Completion(BaseModel):
    prompt: str
    max_new_tokens: int
    model: str


class Generation(BaseModel):
    completion: list[Token]
    last_token_prediction: Prediction


def generate(req: Completion, state: AppState):
    """Generate a completion, saving the last step's distribution.

    Returns the backend to stream when remote and the saved values when local,
    the same way :func:`prediction` does.
    """
    model = state[req.model]
    last_iter = req.max_new_tokens - 1
    backend = state.make_backend(model)
    with model.generate(
        req.prompt,
        max_new_tokens=req.max_new_tokens,
        remote=state.remote,
        backend=backend,
    ) as tracer:

        with tracer.iter[last_iter]:
            logits = model.logits

        probs_V = logits[0, -1, :].softmax(dim=-1)
        values_V_indices_V = t.sort(probs_V, dim=-1, descending=True)
        values_V = values_V_indices_V[0].save()
        indices_V = values_V_indices_V[1].save()

        new_token_ids = model.generator.output[0].save()

    if state.remote:
        return backend

    return {
        "values_V": values_V,
        "indices_V": indices_V,
        "new_token_ids": new_token_ids,
    }


def process_generation_results(saves: dict, req: Completion, state: AppState):
    """Turn the trace's saved values into the client's `Generation`."""
    values_V = saves["values_V"]
    indices_V = saves["indices_V"]
    new_token_ids = saves["new_token_ids"]
    tok = state[req.model].tokenizer
    new_token_text = tok.batch_decode(new_token_ids)

    tokens = [
        Token(idx=i, id=new_token_ids[i].item(), text=text, targetIds=[])
        for i, text in enumerate(new_token_text)
    ]

    # Round values to 2 decimal places
    idx_values = t.round(values_V * 100) / 100
    nonzero = idx_values > 0

    nonzero_values = idx_values[nonzero].tolist()
    nonzero_indices = indices_V[nonzero].tolist()
    nonzero_texts = tok.batch_decode(nonzero_indices)

    last_token_prediction = Prediction(
        idx=new_token_ids[-1],
        ids=nonzero_indices,
        probs=nonzero_values,
        texts=nonzero_texts,
    ).model_dump()

    return {
        "completion": tokens,
        "last_token_prediction": last_token_prediction,
    }


@router.post("/run-generate")
async def run_generate(
    req: Completion,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email)
):
    """Generate a completion, streamed (see ``sse``)."""
    return _stream_trace(
        state,
        user_email,
        model=req.model,
        method="GENERATE",
        run=lambda: generate(req, state),
        process=lambda saves: process_generation_results(saves, req, state),
    )
