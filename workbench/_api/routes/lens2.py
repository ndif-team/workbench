"""
Lens2 Route - Full LogitLens visualization using LogitLensKit V2 format

This route computes the complete logit lens data (tracked tokens, topk predictions,
trajectories) in a single API call, returning data in the LogitLensKit V2 format
for rendering with the LogitLensWidget visualization.

V2 Format:
{
    "meta": { "version": 2, "timestamp": "...", "model": "..." },
    "layers": [0, 1, 2, ...],
    "input": ["token1", "token2", ...],
    "tracked": [
        { "token_a": [prob_layer0, prob_layer1, ...], ... },  # per position
        ...
    ],
    "topk": [
        [["tok1", "tok2"], ["tok1"], ...],  # layer 0: tokens per position
        ...
    ],
    "entropy": [[entropy_pos0, entropy_pos1, ...], ...]  # optional
}
"""

import math
from datetime import datetime, timezone

import torch as t
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_user_email, user_has_model_access
from ..state import AppState, get_state
from ..telemetry import RequestStatus, Stage, TelemetryClient
from ..data_models import NDIFResponse


router = APIRouter()


# Request model
class Lens2Request(BaseModel):
    model: str
    prompt: str
    topk: int = 5  # Number of top-k predictions per cell
    include_entropy: bool = True  # Whether to include entropy data


# Response models following LogitLensKit V2 format
class Lens2Meta(BaseModel):
    version: int = 2
    timestamp: str
    model: str


class Lens2Data(BaseModel):
    meta: Lens2Meta
    layers: list[int]
    input: list[str]  # Input tokens as strings
    tracked: list[dict[str, list[float]]]  # Per-position: token -> trajectory
    topk: list[list[list[str]]]  # [layer][position] -> list of top-k tokens
    entropy: list[list[float]] | None = None  # Optional: [layer][position] -> entropy


class Lens2Response(NDIFResponse):
    data: Lens2Data | None = None


def compute_lens2(req: Lens2Request, state: AppState):
    """
    Compute the full logit lens data for the LogitLensKit V2 format.
    
    This computes:
    1. Hidden state projections at each layer
    2. Top-k predictions at each layer/position
    3. Probability trajectories for all tracked tokens
    4. Optional entropy at each layer/position
    """
    model = state[req.model]
    tok = model.tokenizer

    print(req.prompt)
    
    # Tokenize input
    input_ids = tok.encode(req.prompt)
    input_tokens = tok.batch_decode(input_ids)  # Get string representation
    n_positions = len(input_ids)
    
    with model.trace(
        req.prompt,
        remote=state.remote,
        backend=state.make_backend(model=model),
    ) as tracer:
        all_logits = []  # [n_layers, batch, seq, vocab]
        
        # Collect logits from each layer
        for layer in model.model.layers[:-1]:
            hs = layer.output
            if isinstance(hs, tuple):
                hs = hs[0]
            # Project hidden states to vocabulary space
            logits = model.lm_head(model.model.ln_f(hs))
            all_logits.append(logits)
        
        # Add final layer logits
        final_logits = model.output.logits
        all_logits.append(final_logits)
        
        # Save for remote execution
        all_logits.save()
    
    if state.remote:
        return tracer.backend.job_id
    
    return process_lens2_results(all_logits, input_tokens, req, tok)


def process_lens2_results(
    all_logits: list[t.Tensor],
    input_tokens: list[str],
    req: Lens2Request,
    tok,
) -> Lens2Data:
    """Process raw logits into LogitLensKit V2 format."""
    n_layers = len(all_logits)
    n_positions = len(input_tokens)
    layers = list(range(n_layers))
    
    # Initialize tracking structures
    # tracked[pos] = {token_str: [prob_layer0, prob_layer1, ...]}
    tracked: list[dict[str, list[float]]] = [{} for _ in range(n_positions)]
    
    # topk[layer][pos] = [token_str, ...]
    topk: list[list[list[str]]] = [[] for _ in range(n_layers)]
    
    # entropy[layer][pos] = entropy_value
    entropy: list[list[float]] = [[] for _ in range(n_layers)]
    
    # First pass: collect top-k tokens at each layer/position
    # and build the set of tokens to track per position
    tokens_to_track: list[set[int]] = [set() for _ in range(n_positions)]
    
    for layer_idx, logits in enumerate(all_logits):
        # logits shape: [batch, seq, vocab] -> we take [0, :, :]
        layer_logits = logits[0]  # [seq, vocab]
        
        # Compute softmax probabilities
        probs = t.nn.functional.softmax(layer_logits, dim=-1)
        
        # Get top-k for each position
        topk_probs, topk_indices = probs.topk(req.topk, dim=-1)
        
        layer_topk = []
        layer_entropy = []
        
        for pos in range(n_positions):
            # Get top-k tokens for this position
            pos_topk_indices = topk_indices[pos].tolist()
            pos_topk_tokens = [tok.decode(idx) for idx in pos_topk_indices]
            layer_topk.append(pos_topk_tokens)
            
            # Track these tokens
            tokens_to_track[pos].update(pos_topk_indices)
            
            # Compute entropy if requested
            if req.include_entropy:
                log_p = t.nn.functional.log_softmax(layer_logits[pos], dim=-1)
                p = log_p.exp()
                H = -(p * log_p).sum().item()
                layer_entropy.append(round(H, 5))
        
        topk[layer_idx] = layer_topk
        if req.include_entropy:
            entropy[layer_idx] = layer_entropy
    
    # Second pass: compute trajectories for all tracked tokens
    for pos in range(n_positions):
        tracked_indices = list(tokens_to_track[pos])
        
        for token_idx in tracked_indices:
            token_str = tok.decode(token_idx)
            trajectory = []
            
            for layer_idx, logits in enumerate(all_logits):
                layer_logits = logits[0, pos, :]  # [vocab]
                probs = t.nn.functional.softmax(layer_logits, dim=-1)
                prob = probs[token_idx].item()
                trajectory.append(round(prob, 5))
            
            tracked[pos][token_str] = trajectory
    
    # Build response
    meta = Lens2Meta(
        version=2,
        timestamp=datetime.now(timezone.utc).isoformat(),
        model=req.model,
    )
    
    return Lens2Data(
        meta=meta,
        layers=layers,
        input=input_tokens,
        tracked=tracked,
        topk=topk,
        entropy=entropy if req.include_entropy else None,
    )


def get_remote_lens2(user_email: str, job_id: str, state: AppState):
    """Retrieve remote computation results."""
    backend = state.make_backend(job_id=job_id)
    
    with TelemetryClient.log_latency(
        user_email=user_email,
        job_id=job_id,
        method="LENS2",
        type="FULL",
        stage=Stage.DOWNLOAD
    ):
        results = backend()
    
    return results["all_logits"]


@router.post("/start", response_model=Lens2Response)
async def start_lens2(
    req: Lens2Request,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    """Start a lens2 computation."""
    if state.remote:
        if not user_has_model_access(user_email, req.model, state):
            message = f"User does not have access to {req.model}"
            TelemetryClient.log_request(
                RequestStatus.ERROR,
                user_email,
                method="LENS2",
                type="FULL",
                msg=message,
            )
            raise HTTPException(status_code=403, detail=message)
    
    TelemetryClient.log_request(
        RequestStatus.STARTED,
        user_email,
        method="LENS2",
        type="FULL",
    )
    
    try:
        result = compute_lens2(req, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR,
            user_email,
            method="LENS2",
            type="FULL",
            msg=str(e),
        )
        raise e
    
    if state.remote:
        TelemetryClient.log_request(
            RequestStatus.READY,
            user_email,
            method="LENS2",
            type="FULL",
            job_id=result,
        )
        return {"job_id": result}
    
    return {"data": result}


@router.post("/results/{job_id}", response_model=Lens2Response)
async def collect_lens2(
    job_id: str,
    req: Lens2Request,
    state: AppState = Depends(get_state),
    user_email: str = Depends(require_user_email),
):
    """Collect results from a remote lens2 computation."""
    try:
        all_logits = get_remote_lens2(user_email, job_id, state)
    except Exception as e:
        TelemetryClient.log_request(
            RequestStatus.ERROR,
            user_email,
            job_id=job_id,
            method="LENS2",
            type="FULL",
            msg=str(e),
        )
        raise e
    
    # Get tokenizer for processing
    tok = state[req.model].tokenizer
    input_tokens = tok.batch_decode(tok.encode(req.prompt))
    
    data = process_lens2_results(all_logits, input_tokens, req, tok)
    
    TelemetryClient.log_request(
        RequestStatus.COMPLETE,
        user_email,
        job_id=job_id,
        method="LENS2",
        type="FULL",
    )
    
    return {"data": data}
