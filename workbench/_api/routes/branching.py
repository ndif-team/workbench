"""Branching Generations backend (Feature A).

Two endpoints power the spec §1.4 contract:

- POST /branching/generate    — N samples (different temperature/seed) of
                                  the same prompt, each with per-position top-K
                                  logits.
- POST /branching/continue    — given a prefix and a forced-next-token, return
                                  a continuation completion + per-position top-K.

Workshop deployment doesn't hit these endpoints at participant runtime; the
demo uses pre-cached payloads. These endpoints back researcher mode and the
pre-cache script (`scripts/precache_branching_demo.py`).
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


# --- helpers ----------------------------------------------------------------


def _decode_token(tokenizer, token_id: int) -> str:
    return tokenizer.decode([token_id])


def _top_k_at_step(
    logits_V: "t.Tensor", tokenizer, top_k: int
) -> list[TopKEntry]:
    probs_V = t.nn.functional.softmax(logits_V, dim=-1)
    top_probs, top_ids = t.topk(probs_V, k=min(top_k, probs_V.shape[-1]))
    out: list[TopKEntry] = []
    for tid, p in zip(top_ids.tolist(), top_probs.tolist()):
        out.append(
            TopKEntry(
                token_id=int(tid),
                token_text=_decode_token(tokenizer, int(tid)),
                probability=float(p),
            )
        )
    return out


def _generate_one_sample(
    state: AppState,
    model_name: str,
    prompt: str,
    spec: SamplingSpec,
    max_tokens: int,
    top_k: int,
) -> BranchingSampleData:
    """Run one sampled generation and collect per-step top-K logits.

    The model is driven via nnsight's generate() context. For each iteration
    we save the next-token logits so per-position top-K is materialized.
    """
    model = state[model_name]
    tokenizer = model.tokenizer

    # Manual seeding — nnsight's generate doesn't take a seed argument.
    t.manual_seed(spec.seed)

    # Use list-of-1 slots for accumulators that need to survive nnsight's
    # trace-body rewriting. Plain locals defined inside the with-block don't
    # always propagate out.
    per_step_logits: list = []
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
        for i in range(max_tokens):
            with tracer.iter[i]:
                # logits shape: [B, L, V]; at generation step i, the next-token
                # logits live at position -1 in the second axis.
                step_logits = model.logits[0, -1, :].save()
                per_step_logits.append(step_logits)
        new_token_ids_box.append(model.generator.output[0].save())

    new_token_ids = new_token_ids_box[0] if new_token_ids_box else None
    if new_token_ids is None:
        raise RuntimeError("nnsight trace did not produce generator output")
    new_ids_list = new_token_ids.tolist() if hasattr(new_token_ids, "tolist") else list(new_token_ids)
    # Drop any prompt-prefix that may have been included by the runtime.
    prompt_ids = tokenizer.encode(prompt)
    if list(new_ids_list[: len(prompt_ids)]) == list(prompt_ids):
        new_ids_list = new_ids_list[len(prompt_ids) :]

    completion_tokens: list[Token] = []
    for i, tid in enumerate(new_ids_list[:max_tokens]):
        completion_tokens.append(
            Token(
                idx=i,
                id=int(tid),
                text=_decode_token(tokenizer, int(tid)),
                targetIds=[int(tid)],
            )
        )

    per_position_top_k: list[list[TopKEntry]] = []
    for step_logits in per_step_logits[: len(completion_tokens)]:
        per_position_top_k.append(_top_k_at_step(step_logits, tokenizer, top_k))

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

    per_step_logits: list = []
    new_token_ids_box: list = []
    with model.generate(
        prefix_text,
        max_new_tokens=max_tokens,
        do_sample=False,  # greedy continuation for stable demo
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        for i in range(max_tokens):
            with tracer.iter[i]:
                step_logits = model.logits[0, -1, :].save()
                per_step_logits.append(step_logits)
        new_token_ids_box.append(model.generator.output[0].save())

    new_token_ids = new_token_ids_box[0] if new_token_ids_box else None
    if new_token_ids is None:
        raise RuntimeError("nnsight trace did not produce generator output")
    new_ids_list = new_token_ids.tolist() if hasattr(new_token_ids, "tolist") else list(new_token_ids)
    if list(new_ids_list[: len(full_prefix)]) == list(full_prefix):
        new_ids_list = new_ids_list[len(full_prefix) :]

    cont_tokens: list[Token] = []
    for i, tid in enumerate(new_ids_list[:max_tokens]):
        cont_tokens.append(
            Token(
                idx=i,
                id=int(tid),
                text=_decode_token(tokenizer, int(tid)),
                targetIds=[int(tid)],
            )
        )
    per_position_top_k = [
        _top_k_at_step(s, tokenizer, top_k) for s in per_step_logits[: len(cont_tokens)]
    ]
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
