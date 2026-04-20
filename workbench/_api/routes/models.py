import logging
import time

import requests
import torch as t
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..auth import get_user_email, require_user_email, user_has_model_access
from ..data_models import Token
from ..sse import MEDIA_TYPE, stream_backend, stream_value
from ..state import AppState, get_state
from ..telemetry import RequestStatus, TelemetryClient

logger = logging.getLogger(__name__)

router = APIRouter()

MODELS: list = []
MODELS_LAST_UPDATED = 0
MODEL_INTERVAL = 60


def get_remote_models(state: AppState, is_user_signed_in: bool):
    global MODELS, MODELS_LAST_UPDATED

    if MODELS_LAST_UPDATED == 0 or time.time() - MODELS_LAST_UPDATED > 60:
        ping_resp = requests.get(f"{state.ndif_backend_url}/ping", timeout=30)
        logger.info(f"Call NDIF_BACKEND/ping: {ping_resp.status_code}")

        if ping_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="NDIF backend is not responding")

        stats_resp = requests.get(f"{state.ndif_backend_url}/status", timeout=10)

        logger.info(f"Call NDIF_BACKEND/status: {stats_resp.status_code}")

        if stats_resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch NDIF backend status")

        data = stats_resp.json()

        for deployment_state in data["deployments"].values():
            if deployment_state == {"application_state": "UNHEALTHY"}:
                continue

            if (
                deployment_state["deployment_level"] == "HOT"
                and deployment_state["application_state"] == "RUNNING"
            ):
                state.add_model(deployment_state["repo_id"])
            else:
                state.remove_model(deployment_state["repo_id"])

        MODELS = state.get_active_model_list()
        MODELS_LAST_UPDATED = time.time()

    models = [model.copy() for model in MODELS]
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
        return get_remote_models(state, is_user_signed_in)

    return state.get_all_model_list()


# ------------------------------ Prediction ---------------------------------


class LensCompletion(BaseModel):
    model: str
    prompt: str
    token: Token


class Prediction(BaseModel):
    idx: int
    ids: list[int]
    probs: list[float]
    texts: list[str]


def _trace_prediction(req: LensCompletion, state: AppState, backend):
    """Run the prediction trace. Saves values_LV + indices_LV on the tracer."""
    model = state[req.model]
    idx = req.token.idx

    with model.trace(req.prompt, remote=state.remote, backend=backend):
        logits_BLV = model.logits
        logits_LV = logits_BLV[0, [idx], :].softmax(dim=-1)
        values_LV_indices_LV = t.sort(logits_LV, dim=-1, descending=True)
        values_LV = values_LV_indices_LV[0].save()
        indices_LV = values_LV_indices_LV[1].save()

    return values_LV, indices_LV


def _format_prediction(raw: dict, req: LensCompletion, state: AppState) -> Prediction:
    tok = state[req.model].tokenizer

    values_LV = raw["values_LV"]
    indices_LV = raw["indices_LV"]

    idx_values = t.round(values_LV[0] * 100) / 100
    nonzero = idx_values > 0

    nonzero_values = idx_values[nonzero].tolist()
    nonzero_indices = indices_LV[0][nonzero].tolist()
    nonzero_texts = tok.batch_decode(nonzero_indices)

    return Prediction(
        idx=req.token.idx,
        ids=nonzero_indices,
        probs=nonzero_values,
        texts=nonzero_texts,
    )


@router.post("/run-prediction")
async def run_prediction(
    req: LensCompletion,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        message = f"User does not have access to {req.model}"
        TelemetryClient.log_request(
            RequestStatus.ERROR,
            user_email,
            method="PREDICTION",
            type="NEXT_TOKEN",
            msg=message,
        )
        raise HTTPException(status_code=403, detail=message)

    TelemetryClient.log_request(
        RequestStatus.STARTED,
        user_email,
        method="PREDICTION",
        type="NEXT_TOKEN",
    )

    if not state.remote:
        values_LV, indices_LV = _trace_prediction(req, state, backend=None)
        data = _format_prediction(
            {"values_LV": values_LV, "indices_LV": indices_LV}, req, state
        )
        return StreamingResponse(stream_value(data), media_type=MEDIA_TYPE)

    model = state[req.model]
    backend = state.make_streaming_backend(model=model)
    _trace_prediction(req, state, backend=backend)

    # job_id isn't assigned until iteration actually submits the request, so
    # the READY/COMPLETE milestones previously logged here would carry None.
    # Skip them for now; STARTED + downstream errors are still captured.

    def process(raw: dict) -> Prediction:
        return _format_prediction(raw, req, state)

    return StreamingResponse(stream_backend(backend, process), media_type=MEDIA_TYPE)


# ------------------------------ Generation ---------------------------------


class Completion(BaseModel):
    prompt: str
    max_new_tokens: int
    model: str


class Generation(BaseModel):
    completion: list[Token]
    last_token_prediction: Prediction


def _trace_generate(req: Completion, state: AppState, backend):
    """Run the generation trace. Saves values_V, indices_V, new_token_ids."""
    model = state[req.model]
    last_iter = req.max_new_tokens - 1

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

    return values_V, indices_V, new_token_ids


def _format_generation(raw: dict, req: Completion, state: AppState) -> Generation:
    tok = state[req.model].tokenizer

    values_V = raw["values_V"]
    indices_V = raw["indices_V"]
    new_token_ids = raw["new_token_ids"]

    new_token_text = tok.batch_decode(new_token_ids)

    tokens = [
        Token(idx=i, id=new_token_ids[i].item(), text=text, targetIds=[])
        for i, text in enumerate(new_token_text)
    ]

    idx_values = t.round(values_V * 100) / 100
    nonzero = idx_values > 0

    nonzero_values = idx_values[nonzero].tolist()
    nonzero_indices = indices_V[nonzero].tolist()
    nonzero_texts = tok.batch_decode(nonzero_indices)

    last_token_prediction = Prediction(
        idx=new_token_ids[-1].item(),
        ids=nonzero_indices,
        probs=nonzero_values,
        texts=nonzero_texts,
    )

    return Generation(
        completion=tokens,
        last_token_prediction=last_token_prediction,
    )


@router.post("/run-generate")
async def run_generate(
    req: Completion,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        message = f"User does not have access to {req.model}"
        TelemetryClient.log_request(
            RequestStatus.ERROR,
            user_email,
            method="GENERATE",
            type="NEXT_TOKEN",
            msg=message,
        )
        raise HTTPException(status_code=403, detail=message)

    TelemetryClient.log_request(
        RequestStatus.STARTED,
        user_email,
        method="GENERATE",
        type="NEXT_TOKEN",
    )

    if not state.remote:
        values_V, indices_V, new_token_ids = _trace_generate(req, state, backend=None)
        data = _format_generation(
            {
                "values_V": values_V,
                "indices_V": indices_V,
                "new_token_ids": new_token_ids,
            },
            req,
            state,
        )
        return StreamingResponse(stream_value(data), media_type=MEDIA_TYPE)

    model = state[req.model]
    backend = state.make_streaming_backend(model=model)
    _trace_generate(req, state, backend=backend)

    def process(raw: dict) -> Generation:
        return _format_generation(raw, req, state)

    return StreamingResponse(stream_backend(backend, process), media_type=MEDIA_TYPE)
