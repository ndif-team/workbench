"""Branching Generations backend (Feature A).

Note: when state.remote is True, model.trace queues a job at NDIF and returns
non-blocking. The Workshop Mode UI doesn't call these endpoints at runtime
(participants get pre-cached payloads), but the precache script needs to
drive them synchronously. We poll the NDIF status endpoint internally and
collect the saved tensors once the job is COMPLETED — saving the script
from having to re-implement the lens.py-style two-step start+poll flow.

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

from ..auth import (
    CallerIdentity,
    caller_has_model_access,
    require_user_email,
    require_user_or_workshop,
    user_has_model_access,
)
from ..data_models import Token
from ..state import AppState, get_state
from .._remote_poll import wait_for_job_and_collect
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

    with model.generate(
        prompt,
        max_new_tokens=max_tokens,
        do_sample=True,
        temperature=max(spec.temperature, 1e-5),
        top_p=spec.top_p,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        new_token_ids = model.generator.output[0].save()

    if state.remote:
        results = wait_for_job_and_collect(state, tracer.backend.job_id)
        new_token_ids = results["new_token_ids"]

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
    with model.generate(
        prefix_text,
        max_new_tokens=max_tokens,
        do_sample=False,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        new_token_ids = model.generator.output[0].save()

    if state.remote:
        results = wait_for_job_and_collect(state, tracer.backend.job_id)
        new_token_ids = results["new_token_ids"]

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

    Top-K reduction is done inside the trace so the remote payload is small.
    """
    tokenizer = model.tokenizer
    if not completion_token_ids:
        return []

    prompt_ids = tokenizer.encode(prompt)
    full_ids = list(prompt_ids) + list(completion_token_ids)
    full_text = tokenizer.decode(full_ids)
    completion_start = len(prompt_ids)
    n_completion = len(completion_token_ids)

    with model.trace(
        full_text,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        sliced_logits = model.logits[
            0, completion_start - 1 : completion_start - 1 + n_completion, :
        ]
        probs_LV = t.nn.functional.softmax(sliced_logits, dim=-1)
        top_probs_LK, top_ids_LK = t.topk(probs_LV, k=top_k, dim=-1)
        top_probs = top_probs_LK.save()
        top_ids = top_ids_LK.save()

    if state.remote:
        results = wait_for_job_and_collect(state, tracer.backend.job_id)
        top_probs = results["top_probs"]
        top_ids = results["top_ids"]

    out: list[list[TopKEntry]] = []
    for pos in range(top_probs.shape[0]):
        ids_K = top_ids[pos]
        probs_K = top_probs[pos]
        out.append(
            [
                TopKEntry(
                    token_id=int(tid),
                    token_text=_decode_token(tokenizer, int(tid)),
                    probability=float(p),
                )
                for tid, p in zip(ids_K.tolist(), probs_K.tolist())
            ]
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
    caller: CallerIdentity = Depends(require_user_or_workshop),
):
    """Workshop participants can hit this endpoint via X-Workshop-Session — it
    powers the "Generate full alternate trajectory" drill-down button per
    spec §1.3. Researchers use the standard X-User-Email flow.
    """
    if state.remote and not caller_has_model_access(caller, req.model, state):
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
