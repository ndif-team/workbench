"""Commitment-Strip Logit Lens backend (Feature B).

Sequence-wide logit lens: for each completion-token position, return per-layer
top-K probabilities. Frontend computes "commitment layer" definitions from
this matrix without round-tripping (spec §2.4).
"""
from __future__ import annotations

import logging

import torch as t
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_user_email, user_has_model_access
from ..data_models import Token
from ..state import AppState, get_state
from .._remote_poll import wait_for_job_and_collect
from .commitment_strip_models import (
    CommitmentStripRequest,
    CommitmentStripData,
    CommitmentStripResponse,
    TopKEntry,
)


logger = logging.getLogger(__name__)


router = APIRouter()


def _decode_token(tokenizer, token_id: int) -> str:
    return tokenizer.decode([token_id])


def _topk_for_logits(
    logits_V: "t.Tensor", tokenizer, top_k: int
) -> list[TopKEntry]:
    probs_V = t.nn.functional.softmax(logits_V, dim=-1)
    top_probs, top_ids = t.topk(probs_V, k=min(top_k, probs_V.shape[-1]))
    return [
        TopKEntry(
            token_id=int(tid),
            token_text=_decode_token(tokenizer, int(tid)),
            probability=float(p),
        )
        for tid, p in zip(top_ids.tolist(), top_probs.tolist())
    ]


def _sequence_logit_lens(
    state: AppState,
    model_name: str,
    prompt: str,
    completion: str,
    top_k: int,
) -> CommitmentStripData:
    """Run a forward pass on prompt+completion and project every layer's
    residual at every position back to vocab via lm_head.
    """
    model = state[model_name]
    tokenizer = model.tokenizer

    full_text = prompt + completion
    full_ids = tokenizer.encode(full_text)
    prompt_ids = tokenizer.encode(prompt)
    # Completion positions = the last len(full_ids) - len(prompt_ids) positions
    # of the forward pass. We project residuals at those positions back to
    # vocab through every layer.
    completion_start = len(prompt_ids)
    completion_token_ids = full_ids[completion_start:]

    if not completion_token_ids:
        raise HTTPException(status_code=400, detail="completion is empty after tokenization")

    # Compute top-K *inside* the trace so the wire payload is small (~K instead
    # of full vocab) and the saved tensors have well-known names that survive
    # the remote job_id round-trip.
    with model.trace(
        full_text,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        per_layer_top_ids = []
        per_layer_top_probs = []
        for layer in model.model.layers:
            hs = layer.output
            if isinstance(hs, tuple):
                hs = hs[0]
            logits_BLV = model.lm_head(model.model.ln_f(hs))
            logits_LV = logits_BLV[0, completion_start - 1 : -1, :]
            probs_LV = t.nn.functional.softmax(logits_LV, dim=-1)
            top_probs_LK, top_ids_LK = t.topk(probs_LV, k=top_k, dim=-1)
            per_layer_top_ids.append(top_ids_LK)
            per_layer_top_probs.append(top_probs_LK)
        # Stack into [layers, positions, K]; named locals so the remote results
        # dict has predictable keys.
        stacked_top_ids = t.stack(per_layer_top_ids, dim=0).save()
        stacked_top_probs = t.stack(per_layer_top_probs, dim=0).save()

    if state.remote:
        # Poll NDIF status until COMPLETED, then collect the saved tensors.
        results = wait_for_job_and_collect(state, tracer.backend.job_id)
        stacked_top_ids = results["stacked_top_ids"]
        stacked_top_probs = results["stacked_top_probs"]

    n_layers = stacked_top_ids.shape[0]
    num_positions = len(completion_token_ids)
    per_position_per_layer_top_k: list[list[list[TopKEntry]]] = []
    for pos in range(num_positions):
        per_layer: list[list[TopKEntry]] = []
        for layer in range(n_layers):
            ids_K = stacked_top_ids[layer, pos]
            probs_K = stacked_top_probs[layer, pos]
            per_layer.append(
                [
                    TopKEntry(
                        token_id=int(tid),
                        token_text=_decode_token(tokenizer, int(tid)),
                        probability=float(p),
                    )
                    for tid, p in zip(ids_K.tolist(), probs_K.tolist())
                ]
            )
        per_position_per_layer_top_k.append(per_layer)

    completion_tokens = [
        Token(
            idx=i,
            id=int(tid),
            text=_decode_token(tokenizer, int(tid)),
            targetIds=[int(tid)],
        )
        for i, tid in enumerate(completion_token_ids)
    ]

    return CommitmentStripData(
        prompt=prompt,
        completion_text=completion,
        completion_tokens=completion_tokens,
        model=model_name,
        num_layers=n_layers,
        per_position_per_layer_top_k=per_position_per_layer_top_k,
    )


@router.post("/sequence", response_model=CommitmentStripResponse)
async def start_sequence(
    req: CommitmentStripRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        raise HTTPException(status_code=403, detail=f"no access to {req.model}")

    try:
        data = _sequence_logit_lens(
            state, req.model, req.prompt, req.completion, req.top_k
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("commitment_strip/sequence failed")
        raise HTTPException(status_code=500, detail=str(e))

    return {"data": data}
