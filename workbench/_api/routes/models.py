import logging
import time

import requests
from fastapi import APIRouter, Depends, HTTPException

from nnsightful.tools.j_lens import j_lens

from ..auth import get_user_email
from ..data_models import ModelHeat
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
