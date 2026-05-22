"""VLM Logit Lens route.

Port of /disk/u/jadenfk/wd/CVPR2026-HOW/lens/logit_lens.py into the workbench
backend. Uses nnsight directly (not nnsightful — nnterp/nnsightful don't yet
wrap VisionLanguageModel). The route mirrors logit_lens.py's two-step
start/results NDIF flow.
"""

from __future__ import annotations

import base64
import logging
from datetime import datetime, timezone
from io import BytesIO

import torch
from fastapi import APIRouter, Depends, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

from ..auth import require_user_email
from ..data_models import NDIFResponse
from ..state import AppState, get_state

logger = logging.getLogger(__name__)
router = APIRouter()

# llava-hf/llava-1.5-7b-hf processor expansion of the single <image>
# placeholder token. If we add other VLMs these will need to come from the
# model config instead of being hardcoded.
LLAVA_IMG_TOKEN_ID = 32000
LLAVA_IMAGE_SIZE = 336
LLAVA_PATCH_SIZE = 14


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class VLMLensRequest(BaseModel):
    model: str
    prompt: str
    # PNG/JPEG bytes, base64-encoded (no data: prefix).
    image_b64: str
    top_k: int = 5


class VLMLensMeta(BaseModel):
    version: int = 1
    timestamp: str
    model: str
    prompt: str


class VLMLensData(BaseModel):
    """Payload returned to the frontend and persisted in charts.data."""

    meta: VLMLensMeta
    input_tokens: list[str]                    # with <IMGxxx> labels expanded
    num_layers: int
    image_size: int
    patch_size: int
    num_image_tokens: int                      # = (image_size // patch_size) ** 2
    # topk[layer][position] -> list of [token_str, "%.4f" % prob] of length top_k
    topk: list[list[list[tuple[str, str]]]]


class VLMLensResponse(NDIFResponse):
    data: VLMLensData | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _decode_image(image_b64: str) -> Image.Image:
    if not image_b64:
        raise HTTPException(status_code=400, detail="image_b64 is required")
    # Tolerate a data: URL prefix if the frontend forwards one.
    if "," in image_b64 and image_b64.lstrip().startswith("data:"):
        image_b64 = image_b64.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_b64, validate=False)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image_b64 not valid base64: {e}")
    try:
        return Image.open(BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image_b64 not a valid image: {e}")


def _expanded_input_tokens(tokenizer, prompt: str, num_image_tokens: int) -> list[str]:
    """Mirror the processor's expansion: a single <image> placeholder token
    becomes num_image_tokens <IMGxxx> labels so the per-position lens rows
    map cleanly to image patches."""
    labels: list[str] = []
    for tok_id in tokenizer.encode(prompt):
        if tok_id == LLAVA_IMG_TOKEN_ID:
            labels.extend(f"<IMG{(i + 1):03d}>" for i in range(num_image_tokens))
        else:
            labels.append(tokenizer.decode([tok_id]))
    return labels


def _run_trace(model, prompt: str, image: Image.Image, top_k: int, *, remote: bool, backend):
    """Run the lens trace. Saves topk values+indices for every decoder layer.

    Uses the `list().save()` pattern (cf. the nnsightful logit_lens tool).
    The trace body runs deferred in a worker — locals assigned inside the
    `with` block do NOT propagate back here. The saved values are accessible
    only after `backend()` is called downstream (or, for local execution,
    via the proxy returned by `.save()`).
    """
    layers = model.model.language_model.layers
    norm = model.model.language_model.norm
    lm_head = model.lm_head

    # Pre-bind so the references survive the deferred-execution scoping.
    topk_values = None
    topk_indices = None
    with model.trace(prompt, images=[image], remote=remote, backend=backend):
        topk_values = list().save()
        topk_indices = list().save()
        for layer in layers:
            logits = lm_head(norm(layer.output))
            probs = logits.softmax(dim=-1)
            top = probs.topk(k=top_k, dim=-1)
            topk_values.append(top.values)
            topk_indices.append(top.indices)

    return {"topk_values": topk_values, "topk_indices": topk_indices}


def _format(
    saved: dict,
    tokenizer,
    prompt: str,
    model_name: str,
    image_size: int = LLAVA_IMAGE_SIZE,
    patch_size: int = LLAVA_PATCH_SIZE,
) -> VLMLensData:
    """Materialize saved {topk_values, topk_indices} lists into the wire payload."""
    num_image_tokens = (image_size // patch_size) ** 2

    # Resolve nnsight save proxies to underlying tensors (no-op for plain tensors).
    def resolve(x):
        return getattr(x, "value", x)

    values_list = [resolve(t) for t in resolve(saved["topk_values"])]
    indices_list = [resolve(t) for t in resolve(saved["topk_indices"])]

    if not indices_list:
        raise HTTPException(status_code=500, detail="Saved tensors were empty.")

    seq_len = indices_list[0].shape[1]
    input_tokens = _expanded_input_tokens(tokenizer, prompt, num_image_tokens)
    if len(input_tokens) != seq_len:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Token-label length {len(input_tokens)} does not match model "
                f"sequence length {seq_len}. Check IMG_TOKEN_ID / patch count."
            ),
        )

    topk: list[list[list[tuple[str, str]]]] = []
    for values, indices in zip(values_list, indices_list):
        layer_rows: list[list[tuple[str, str]]] = []
        for pos in range(seq_len):
            row = [
                (tokenizer.decode(idx.item()), f"{p.item():.4f}")
                for idx, p in zip(indices[0, pos], values[0, pos])
            ]
            layer_rows.append(row)
        topk.append(layer_rows)

    return VLMLensData(
        meta=VLMLensMeta(
            timestamp=datetime.now(timezone.utc).isoformat(),
            model=model_name,
            prompt=prompt,
        ),
        input_tokens=input_tokens,
        num_layers=len(indices_list),
        image_size=image_size,
        patch_size=patch_size,
        num_image_tokens=num_image_tokens,
        topk=topk,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/start", response_model=VLMLensResponse)
async def start_vlm_lens(
    req: VLMLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if not state.is_vlm(req.model):
        raise HTTPException(
            status_code=400,
            detail=f"Model '{req.model}' is not registered as a VLM in this deployment.",
        )

    # Lazy-load: /models/ only adds HOT deployments; we want the tool to work
    # against a COLD model too (NDIF will warm it on first trace).
    if req.model not in state.vlm_models:
        state.add_model(req.model)

    model = state.get_model(req.model)
    image = _decode_image(req.image_b64)
    backend = state.make_backend(model=model)

    saved = _run_trace(model, req.prompt, image, req.top_k, remote=state.remote, backend=backend)

    if state.remote:
        # Non-blocking remote: backend has job_id stamped once the trace primes it.
        if backend is None or backend.job_id is None:
            raise HTTPException(status_code=500, detail="Remote backend did not return a job_id")
        return {"job_id": backend.job_id}

    return {"data": _format(saved, model.tokenizer, req.prompt, req.model)}


@router.post("/results/{job_id}", response_model=VLMLensResponse)
async def results_vlm_lens(
    job_id: str,
    req: VLMLensRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if not state.is_vlm(req.model):
        raise HTTPException(status_code=400, detail=f"Model '{req.model}' is not a VLM")

    if req.model not in state.vlm_models:
        state.add_model(req.model)

    model = state.get_model(req.model)
    backend = state.make_backend(job_id=job_id)
    raw = backend()

    # nnsight remote backends sometimes wrap the saved values under a
    # 'results' key. Unwrap defensively so the format step always sees the
    # flat dict our trace produced.
    if isinstance(raw, dict) and "results" in raw and "topk_values" not in raw:
        raw = raw["results"]

    # Expected shape: a dict-like with our save names (topk_values, topk_indices).
    if not isinstance(raw, dict):
        # If it's a namespace / object with attrs, coerce.
        raw = {
            "topk_values": getattr(raw, "topk_values", None),
            "topk_indices": getattr(raw, "topk_indices", None),
        }

    return {"data": _format(raw, model.tokenizer, req.prompt, req.model)}
