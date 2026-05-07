from __future__ import annotations

from typing import Any

import torch
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import require_user_email
from ..data_models import NDIFResponse
from ..state import AppState, get_state

from nnsightful.types import LogitLensData
from nnsightful.tools.logit_lens import logit_lens as logit_lens_tool

router = APIRouter()


class CausalMediationRequest(BaseModel):
    model: str
    src_prompt: str
    tgt_prompt: str
    src_token_pos: int
    src_layer: int
    tgt_token_pos: int
    tgt_layer: int
    topk: int = 5
    include_entropy: bool = True


class CausalMediationResponse(NDIFResponse):
    """Identical shape to LogitLensResponse so the frontend can reuse the
    existing logit-lens transform/renderer."""
    data: LogitLensData | None = None


def _run_causal_mediation(
    model,
    src_prompt: str,
    tgt_prompt: str,
    src_token_pos: int,
    src_layer: int,
    tgt_token_pos: int,
    tgt_layer: int,
    model_name: str,
    *,
    remote: bool = False,
    backend=None,
) -> dict[str, Any]:
    """Single-location activation patching followed by a full logit lens over
    the patched forward pass.

    Execution layout (mirrors nnsightful.tools.activation_patching._run which
    works for both local and remote/NDIF backends):

        with model.session(remote=..., backend=...) as session:
            with model.trace(src_prompt):
                src_hidden = model.layers[src_layer].output[0][:, src_token_pos].clone().save()
            with model.trace(tgt_prompt):
                model.layers[tgt_layer].output[0][:, tgt_token_pos][:] = src_hidden
                for i in range(num_layers):
                    all_logits.append(model.project_on_vocab(model.layers_output[i]))

    Returned dict is in the exact shape that
    ``nnsightful.tools.logit_lens.logit_lens._format`` consumes.
    """
    n_layers = model.num_layers
    layer_indices = list(range(n_layers))

    input_tokens: list[str] = [
        str(model.tokenizer.decode(token))
        for token in model.tokenizer.encode(tgt_prompt)
    ]

    all_logits = None
    session = None

    with torch.no_grad():
        with model.session(remote=remote, backend=backend) as session:
            # 1) Source trace: capture the hidden state at (src_layer, src_token_pos).
            #    Access via model.layers_output[src_layer] (same envoy the lens
            #    loop below uses) rather than model.layers[...].output, so we
            #    don't touch the layer output envoy out of order.
            with model.trace(src_prompt):
                src_hidden = model.layers_output[src_layer][0, src_token_pos].save()

            # 2) Target trace: walk layers in order via model.layers[i].output
            #    (transformer blocks return a tuple `(hidden_state, ...)`). At
            #    tgt_layer, slice-assign the source activation AND reassign
            #    `model.layers[i].output = (patched_hs, ...)`. The explicit
            #    re-assignment is what registers the intervention in nnsight so
            #    the patched residual flows into subsequent layers; without it
            #    the slice-assign only mutates the local proxy and the patch
            #    has no downstream effect. This mirrors patch.py:277-288.
            with model.trace(tgt_prompt):
                all_logits = list().save()
                for i in layer_indices:
                    layer_output = model.layers[i].output
                    hs = layer_output[0]
                    if i == tgt_layer:
                        hs[0, tgt_token_pos][:] = src_hidden
                        model.layers[i].output = (hs, layer_output[1])
                    logits = model.project_on_vocab(hs)
                    all_logits.append(logits)

    raw: dict[str, Any] = {
        "input_tokens": input_tokens,
        "all_logits": all_logits,
        "tokenizer": model.tokenizer,
        "layer_indices": layer_indices,
        "model_name": model_name,
    }

    if remote and backend is not None:
        raw["job_id"] = session.backend.job_id

    return raw


@router.post("/start", response_model=CausalMediationResponse)
async def start_causal_mediation(
    req: CausalMediationRequest,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    model = state[req.model]
    backend = state.make_backend(model=model)

    raw = _run_causal_mediation(
        model,
        req.src_prompt,
        req.tgt_prompt,
        req.src_token_pos,
        req.src_layer,
        req.tgt_token_pos,
        req.tgt_layer,
        req.model,
        remote=state.remote,
        backend=backend,
    )

    if "job_id" in raw:
        return {"job_id": raw["job_id"]}

    data = logit_lens_tool._format(
        raw,
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

    print(
        "causal_mediation collect keys:",
        list(results.keys()) if isinstance(results, dict) else type(results),
    )

    tokenizer = state[req.model].tokenizer
    results["tokenizer"] = tokenizer
    results["model_name"] = req.model
    # Logit lens is over the *target* forward pass, so the input-token strip
    # reflects the target prompt.
    results["input_tokens"] = [
        str(tokenizer.decode(token))
        for token in tokenizer.encode(req.tgt_prompt)
    ]

    data = logit_lens_tool._format(
        results,
        top_k=req.topk,
        include_entropy=req.include_entropy,
    )

    return {"data": data}
