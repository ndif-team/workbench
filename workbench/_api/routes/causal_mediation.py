from __future__ import annotations

from typing import Any

import torch
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_user_email
from ..data_models import NDIFResponse
from ..state import AppState, get_state

from nnsightful.types import LogitLensData

router = APIRouter()


class CausalMediationRequest(BaseModel):
    model: str
    src_prompt: str
    tgt_prompt: str
    src_token_pos: int = Field(ge=0)
    src_layer: int = Field(ge=0)
    tgt_token_pos: int = Field(ge=0)
    tgt_layer: int = Field(ge=0)
    topk: int = Field(default=5, ge=1)
    include_entropy: bool = True


class CausalMediationResponse(NDIFResponse):
    """Identical shape to LogitLensResponse so the frontend can reuse the
    existing logit-lens transform/renderer."""
    data: LogitLensData | None = None


def _format_lens(
    logits: torch.Tensor,
    tokenizer,
    model_name: str,
    input_tokens: list[str],
    n_layers: int,
    *,
    top_k: int = 5,
    include_entropy: bool = True,
) -> dict[str, Any]:
    """Inlined mirror of the local `format()` inside
    `nnsightful.tools.logit_lens._run`. Turns a [L, T, V] logits tensor into
    the dict shape consumed by `LogitLensData(**...)`.

    Why: `LogitLensTool` doesn't override `_format`, so calling
    `logit_lens_tool._format(...)` falls through to the abstract `Tool._format`
    in `nnsightful/tools/_base.py` whose body is `...` — i.e. returns `None`.
    """
    layers = list(range(n_layers))
    positions = list(range(len(input_tokens)))

    if include_entropy:
        # log_softmax once, then exp() reuses it for probs — softmax(x) ==
        # log_softmax(x).exp() — so we avoid a second full-tensor softmax pass.
        log_p = torch.nn.functional.log_softmax(logits, dim=-1)
        probs = log_p.exp()
        entropy = torch.round(-(probs * log_p).sum(dim=-1), decimals=3).tolist()
    else:
        probs = torch.nn.functional.softmax(logits, dim=-1)
        entropy = None

    _, top_indices = torch.topk(probs, k=top_k, dim=-1)

    topks = [
        [tokenizer.batch_decode(torch.tensor(pos).unsqueeze(dim=1)) for pos in layer]
        for layer in top_indices.tolist()
    ]

    unique_indices = [
        torch.unique(top_indices[:, pi, :].flatten(), sorted=False).tolist()
        for pi in range(top_indices.shape[1])
    ]
    probs = probs.permute(1, 2, 0)
    trajectories = [
        {
            tokenizer.decode(token): torch.round(probs[pos_idx][token], decimals=3).tolist()
            for token in pos
        }
        for pos_idx, pos in enumerate(unique_indices)
    ]

    return {
        "meta": {"version": 2, "timestamp": "3h", "model": model_name},
        "layers": layers,
        "input": input_tokens,
        "tracked": trajectories,
        "topk": topks,
        "entropy": entropy,
        "positions": positions,
    }


def _decode_input_tokens(tokenizer, prompt: str) -> list[str]:
    """Per-token decoded strings for a prompt (BOS-inclusive, absolute order).
    Shared by the /start and /results handlers so the two decode loops can't
    drift apart."""
    return [str(tokenizer.decode(token)) for token in tokenizer.encode(prompt)]


def _validate_indices(req: CausalMediationRequest, model) -> None:
    """Reject out-of-range layer/token indices with a 422 rather than letting an
    IndexError during tracing surface as an opaque 500. `Field(ge=0)` already
    guards negatives; here we bound-check against the model's layer count and
    each prompt's token length."""
    n_layers = model.num_layers
    if req.src_layer >= n_layers or req.tgt_layer >= n_layers:
        raise HTTPException(
            status_code=422,
            detail=f"Layer index out of range (model has {n_layers} layers).",
        )
    n_src = len(model.tokenizer.encode(req.src_prompt))
    n_tgt = len(model.tokenizer.encode(req.tgt_prompt))
    if req.src_token_pos >= n_src:
        raise HTTPException(
            status_code=422,
            detail=f"src_token_pos out of range (source prompt has {n_src} tokens).",
        )
    if req.tgt_token_pos >= n_tgt:
        raise HTTPException(
            status_code=422,
            detail=f"tgt_token_pos out of range (target prompt has {n_tgt} tokens).",
        )


def _run_causal_mediation(
    model,
    src_prompt: str,
    tgt_prompt: str,
    src_token_pos: int,
    src_layer: int,
    tgt_token_pos: int,
    tgt_layer: int,
    *,
    remote: bool = False,
    backend=None,
) -> dict[str, Any]:
    """Capture the source residual at (src_layer, src_token_pos), patch it
    into the target prompt at (tgt_layer, tgt_token_pos), then run a logit
    lens over the *patched* forward pass.

    Patching pattern mirrors `nnsightful.tools.activation_patching._run`:
    a slice-assign on `model.layers_output[i]` is sufficient to register the
    intervention and have it propagate through subsequent layers — no
    explicit `model.layers[i].output = (...)` reassignment is needed.
    """
    n_layers = model.num_layers

    with torch.no_grad():
        with model.session(remote=remote, backend=backend):
            # 1) Source pass — capture the residual at (src_layer, src_token_pos).
            with model.trace(src_prompt):
                src_hidden = model.layers_output[src_layer][0, src_token_pos].save()

            # 2) Target pass — at tgt_layer, slice-assign the source residual
            #    into the target's tgt_token_pos. project_on_vocab at every
            #    layer gives us a logit-lens grid over the patched pass.
            with model.trace(tgt_prompt):
                per_layer_logits = []
                for i in range(n_layers):
                    hs = model.layers_output[i]
                    if i == tgt_layer:
                        hs[0, tgt_token_pos][:] = src_hidden
                    per_layer_logits.append(model.project_on_vocab(hs))
                # Stack to a single [L, T, V] tensor so backend() returns a
                # known shape on the remote path (one saved key: "logits").
                logits = torch.cat(per_layer_logits, dim=0).save()

    if remote and backend is not None:
        return {"job_id": backend.job_id}

    return {"logits": logits}


@router.post("/start", response_model=CausalMediationResponse)
async def start_causal_mediation(
    req: CausalMediationRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]
    _validate_indices(req, model)
    backend = state.make_backend(model=model)

    raw = _run_causal_mediation(
        model,
        req.src_prompt,
        req.tgt_prompt,
        req.src_token_pos,
        req.src_layer,
        req.tgt_token_pos,
        req.tgt_layer,
        remote=state.remote,
        backend=backend,
    )

    if "job_id" in raw:
        return {"job_id": raw["job_id"]}

    input_tokens = _decode_input_tokens(model.tokenizer, req.tgt_prompt)
    data = _format_lens(
        raw["logits"],
        tokenizer=model.tokenizer,
        model_name=req.model,
        input_tokens=input_tokens,
        n_layers=model.num_layers,
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )
    return {"data": data}


@router.post("/results/{job_id}", response_model=CausalMediationResponse)
async def collect_causal_mediation(
    job_id: str,
    req: CausalMediationRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    backend = state.make_backend(job_id=job_id)
    results = backend()

    # The model can be deregistered from the catalog (NDIF stopped serving it)
    # between /start and /results; state[...] raises KeyError in that case.
    # Surface a clear 503 instead of an opaque 500.
    try:
        model = state[req.model]
    except KeyError:
        raise HTTPException(
            status_code=503,
            detail=f"Model {req.model} is no longer available; please re-run.",
        )
    tokenizer = model.tokenizer
    input_tokens = _decode_input_tokens(tokenizer, req.tgt_prompt)

    data = _format_lens(
        results["logits"],
        tokenizer=tokenizer,
        model_name=req.model,
        input_tokens=input_tokens,
        n_layers=model.num_layers,
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )

    return {"data": data}
