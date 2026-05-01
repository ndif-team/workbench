"""Branching Generations backend (Feature A).

Two endpoints power the spec §1.4 contract:

- POST /branching/generate    — N samples (different temperature/seed) of
                                  the same prompt, each with per-position top-K
                                  logits.
- POST /branching/continue    — given a prefix and a forced-next-token, return
                                  a continuation completion + per-position top-K.

Workshop deployment doesn't hit these endpoints at participant runtime; the
demo uses pre-cached payloads. These endpoints back researcher mode and the
pre-cache script (`scripts/precache_workshop_payloads.py`).

Implementation note (Phase 1.5): collecting per-step logits *during* sampled
generation via `model.generate(...)` + `tracer.iter[i]` in a loop hits an
nnsight scoping bug (locals defined inside the with-block don't survive
exit). Instead we use a two-pass approach: (1) generate the tokens, then
(2) run a single forward pass over `prompt + completion` and extract
top-K at each completion position. This is mathematically equivalent — the
next-token distribution at position i depends only on tokens 0..i-1, which
is what the teacher-forced forward pass conditions on.
"""
from __future__ import annotations

import logging

import torch as t
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_user_email, user_has_model_access
from ..data_models import Token
from ..state import AppState, get_state
from .branching_models import (
    SamplingSpec,
    BranchingGenerateRequest,
    BranchingGenerateData,
    BranchingGenerateResponse,
    BranchingSampleData,
    BranchingContinueRequest,
    BranchingContinueData,
    BranchingContinueResponse,
    TopKEntry,
)


logger = logging.getLogger(__name__)


router = APIRouter()


def _decode_token(tokenizer, token_id: int) -> str:
    return tokenizer.decode([token_id])


def _top_k_for_logits(logits_V, tokenizer, top_k: int) -> list[TopKEntry]:
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


def _generate_token_ids(
    state: AppState,
    model,
    prompt: str,
    spec: SamplingSpec,
    max_tokens: int,
) -> list[int]:
    """Pass 1: produce sampled token ids only — no per-step logit capture.

    Returns the *new* tokens (prompt prefix stripped if the runtime included it).
    """
    tokenizer = model.tokenizer
    t.manual_seed(spec.seed)

    new_token_ids_box: list = []
    with model.generate(
        prompt,
        max_new_tokens=max_tokens,
        do_sample=True,
        temperature=max(spec.temperature, 1e-5),
        top_p=spec.top_p,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        new_token_ids_box.append(model.generator.output[0].save())

    new_token_ids = new_token_ids_box[0] if new_token_ids_box else None
    if new_token_ids is None:
        raise RuntimeError("nnsight generate did not produce output")
    new_ids_list = (
        new_token_ids.tolist()
        if hasattr(new_token_ids, "tolist")
        else list(new_token_ids)
    )
    prompt_ids = tokenizer.encode(prompt)
    if list(new_ids_list[: len(prompt_ids)]) == list(prompt_ids):
        new_ids_list = new_ids_list[len(prompt_ids) :]
    return [int(x) for x in new_ids_list[:max_tokens]]


def _greedy_continuation_token_ids(
    state: AppState,
    model,
    prefix_text: str,
    max_tokens: int,
) -> list[int]:
    """Same as _generate_token_ids but greedy (do_sample=False)."""
    tokenizer = model.tokenizer
    new_token_ids_box: list = []
    with model.generate(
        prefix_text,
        max_new_tokens=max_tokens,
        do_sample=False,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        new_token_ids_box.append(model.generator.output[0].save())

    new_token_ids = new_token_ids_box[0] if new_token_ids_box else None
    if new_token_ids is None:
        raise RuntimeError("nnsight generate did not produce output")
    new_ids_list = (
        new_token_ids.tolist()
        if hasattr(new_token_ids, "tolist")
        else list(new_token_ids)
    )
    prefix_ids = tokenizer.encode(prefix_text)
    if list(new_ids_list[: len(prefix_ids)]) == list(prefix_ids):
        new_ids_list = new_ids_list[len(prefix_ids) :]
    return [int(x) for x in new_ids_list[:max_tokens]]


def _per_position_top_k(
    state: AppState,
    model,
    prompt: str,
    completion_token_ids: list[int],
    top_k: int,
) -> list[list[TopKEntry]]:
    """Pass 2: run a single forward pass over prompt+completion, then extract
    top-K at each completion position.

    Equivalent to per-step logits — at each completion position the next-token
    distribution depends only on the tokens before it, which is what teacher-
    forcing on the actual sampled completion provides.
    """
    tokenizer = model.tokenizer
    if not completion_token_ids:
        return []

    prompt_ids = tokenizer.encode(prompt)
    full_ids = list(prompt_ids) + list(completion_token_ids)
    full_text = tokenizer.decode(full_ids)
    completion_start = len(prompt_ids)

    logits_box: list = []
    with model.trace(
        full_text,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        # logits[0, i, :] is the next-token distribution conditioned on tokens 0..i.
        # We want the distribution for predicting completion position p, which is
        # at logits index (completion_start - 1 + p). Slice all those rows.
        sliced = model.logits[0, completion_start - 1 : completion_start - 1 + len(completion_token_ids), :]
        logits_box.append(sliced.save())

    logits_LV = logits_box[0] if logits_box else None
    if logits_LV is None:
        raise RuntimeError("nnsight trace did not produce logits")

    out: list[list[TopKEntry]] = []
    for pos in range(logits_LV.shape[0]):
        out.append(_top_k_for_logits(logits_LV[pos], tokenizer, top_k))
    return out


def _generate_one_sample(
    state: AppState,
    model_name: str,
    prompt: str,
    spec: SamplingSpec,
    max_tokens: int,
    top_k: int,
) -> BranchingSampleData:
    """Run sampled generation + a teacher-forced forward pass to collect
    per-position top-K logits.
    """
    model = state[model_name]
    tokenizer = model.tokenizer

    new_ids_list = _generate_token_ids(state, model, prompt, spec, max_tokens)
    completion_tokens = [
        Token(
            idx=i,
            id=int(tid),
            text=_decode_token(tokenizer, int(tid)),
            targetIds=[int(tid)],
        )
        for i, tid in enumerate(new_ids_list)
    ]

    per_position_top_k = _per_position_top_k(
        state, model, prompt, new_ids_list, top_k
    )
    completion_text = tokenizer.decode([tok.id for tok in completion_tokens])

    return BranchingSampleData(
        temperature=spec.temperature,
        seed=spec.seed,
        completion_text=completion_text,
        completion_tokens=completion_tokens,
        per_position_top_k=per_position_top_k,
    )


def _continue_from_branch(
    state: AppState,
    model_name: str,
    prompt: str,
    prefix_token_ids: list[int],
    forced_next_token_id: int,
    max_tokens: int,
    top_k: int,
) -> BranchingContinueData:
    model = state[model_name]
    tokenizer = model.tokenizer

    # Build the full input the model will continue from: original prompt plus
    # all already-chosen tokens plus the forced alternative.
    prompt_ids = tokenizer.encode(prompt)
    full_prefix = list(prompt_ids) + list(prefix_token_ids) + [int(forced_next_token_id)]
    prefix_text = tokenizer.decode(full_prefix)

    cont_ids = _greedy_continuation_token_ids(state, model, prefix_text, max_tokens)
    cont_tokens = [
        Token(
            idx=i,
            id=int(tid),
            text=_decode_token(tokenizer, int(tid)),
            targetIds=[int(tid)],
        )
        for i, tid in enumerate(cont_ids)
    ]
    # Per-position top-K via teacher-forced trace on the continuation.
    per_position_top_k = _per_position_top_k(state, model, prefix_text, cont_ids, top_k)
    continuation_text = tokenizer.decode([tok.id for tok in cont_tokens])

    return BranchingContinueData(
        prompt=prompt,
        model=model_name,
        prefix_token_ids=list(prefix_token_ids),
        forced_next_token_id=int(forced_next_token_id),
        continuation_text=continuation_text,
        continuation_tokens=cont_tokens,
        per_position_top_k=per_position_top_k,
    )


@router.post("/generate", response_model=BranchingGenerateResponse)
async def start_generate(
    req: BranchingGenerateRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        raise HTTPException(status_code=403, detail=f"no access to {req.model}")

    samples_out: list[BranchingSampleData] = []
    for spec in req.samples:
        try:
            samples_out.append(
                _generate_one_sample(
                    state,
                    req.model,
                    req.prompt,
                    spec,
                    req.max_tokens,
                    req.top_k,
                )
            )
        except Exception as e:
            logger.exception("branching/generate failed for sample %s", spec)
            raise HTTPException(status_code=500, detail=str(e))

    return {
        "data": BranchingGenerateData(
            prompt=req.prompt,
            model=req.model,
            samples=samples_out,
        )
    }


@router.post("/continue", response_model=BranchingContinueResponse)
async def start_continue(
    req: BranchingContinueRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    if state.remote and not user_has_model_access(user_email, req.model, state):
        raise HTTPException(status_code=403, detail=f"no access to {req.model}")

    try:
        data = _continue_from_branch(
            state,
            req.model,
            req.prompt,
            req.prefix_token_ids,
            req.forced_next_token_id,
            req.max_tokens,
            req.top_k,
        )
    except Exception as e:
        logger.exception("branching/continue failed")
        raise HTTPException(status_code=500, detail=str(e))

    return {"data": data}
