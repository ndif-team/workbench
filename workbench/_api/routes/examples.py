"""Workshop examples loader.

Loads pre-cached INIF payloads from on-disk fixtures so workshop participants
never wait on live NDIF compute. Spec source: workbench-features-spec-2026-04-30.md
§0.2 (pre-cached example payloads).
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from ..data_models import (
    BranchingGenerationSet,
    CommitmentStripPayload,
    PromptInfluencePayload,
    WorkshopExamplePayload,
)


router = APIRouter()


# Fixtures live alongside the API package so deployment bundles them.
# Phase 2 may move this to S3; the loader interface stays the same.
EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "_workshop_examples"


_RECORD_TYPE_TO_MODEL = {
    "branching_generation_set": BranchingGenerationSet,
    "commitment_strip": CommitmentStripPayload,
    "prompt_influence": PromptInfluencePayload,
}


def _load_payload_from_disk(example_id: str) -> WorkshopExamplePayload:
    path = EXAMPLES_DIR / f"{example_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"example '{example_id}' not found")

    try:
        with open(path, "r") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"invalid JSON in {path.name}: {e}")

    record_type = raw.get("record_type")
    model_cls = _RECORD_TYPE_TO_MODEL.get(record_type)
    if model_cls is None:
        raise HTTPException(
            status_code=500,
            detail=f"unknown record_type '{record_type}' in {path.name}",
        )

    try:
        return model_cls.model_validate(raw)
    except ValidationError as e:
        raise HTTPException(status_code=500, detail=f"schema validation failed: {e}")


@router.get("/{example_id}")
async def get_example(example_id: str) -> dict:
    """Return a pre-cached workshop example payload by ID.

    Anonymous access is intentional — workshop participants are not authenticated.
    """
    # Light path-traversal hardening; example_id is keyed against on-disk files.
    if "/" in example_id or ".." in example_id or example_id.startswith("."):
        raise HTTPException(status_code=400, detail="invalid example_id")

    payload = _load_payload_from_disk(example_id)
    # by_alias=True so Token fields serialize as `targetIds` (wire format)
    # not `target_ids` (Python field name) — matches the lens/logit_lens
    # request/response convention.
    return payload.model_dump(by_alias=True)


@router.get("/")
async def list_examples() -> dict:
    """List all available workshop example IDs grouped by record_type."""
    if not EXAMPLES_DIR.is_dir():
        return {"examples": {}}

    grouped: dict[str, list[str]] = {
        "branching_generation_set": [],
        "commitment_strip": [],
        "prompt_influence": [],
    }
    for path in sorted(EXAMPLES_DIR.glob("*.json")):
        try:
            with open(path, "r") as f:
                raw = json.load(f)
            rt = raw.get("record_type")
            if rt in grouped:
                grouped[rt].append(path.stem)
        except (json.JSONDecodeError, OSError):
            continue
    return {"examples": grouped}
