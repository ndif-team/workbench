from typing import TYPE_CHECKING
import torch
from datetime import datetime, timezone

from ..visualizations.types import LogitLensMeta, LogitLensData

if TYPE_CHECKING:
    from nnsight import LanguageModel

def logit_lens(
    prompt: str,
    model: "LanguageModel",
    remote: bool,
    backend,
):
    with model.trace(
        prompt,
        remote=remote,
        backend=backend,
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

    if remote:
        return tracer.backend.job_id
    
    return all_logits


def format_data(
    all_logits: list[torch.Tensor],
    input_tokens: list[str],
    topk: int,
    include_entropy: bool,
    model_name: str,
    tokenizer,
):
    n_layers = len(all_logits)
    n_positions = len(input_tokens)
    layers = list(range(n_layers))
    
    # Initialize tracking structures
    # tracked[pos] = {token_str: [prob_layer0, prob_layer1, ...]}
    tracked: list[dict[str, list[float]]] = [{} for _ in range(n_positions)]
    
    # topk[layer][pos] = [token_str, ...]
    topk_list: list[list[list[str]]] = [[] for _ in range(n_layers)]
    
    # entropy[layer][pos] = entropy_value
    entropy: list[list[float]] = [[] for _ in range(n_layers)]
    
    # First pass: collect top-k tokens at each layer/position
    # and build the set of tokens to track per position
    tokens_to_track: list[set[int]] = [set() for _ in range(n_positions)]
    
    for layer_idx, logits in enumerate(all_logits):
        # logits shape: [batch, seq, vocab] -> we take [0, :, :]
        layer_logits = logits[0]  # [seq, vocab]
        
        # Compute softmax probabilities
        probs = torch.nn.functional.softmax(layer_logits, dim=-1)
        
        # Get top-k for each position
        topk_probs, topk_indices = probs.topk(topk, dim=-1)
        
        layer_topk = []
        layer_entropy = []
        
        for pos in range(n_positions):
            # Get top-k tokens for this position
            pos_topk_indices = topk_indices[pos].tolist()
            pos_topk_tokens = [tokenizer.decode(idx) for idx in pos_topk_indices]
            layer_topk.append(pos_topk_tokens)
            
            # Track these tokens
            tokens_to_track[pos].update(pos_topk_indices)
            
            # Compute entropy if requested
            if include_entropy:
                log_p = torch.nn.functional.log_softmax(layer_logits[pos], dim=-1)
                p = log_p.exp()
                H = -(p * log_p).sum().item()
                layer_entropy.append(round(H, 5))
        
        topk_list[layer_idx] = layer_topk
        if include_entropy:
            entropy[layer_idx] = layer_entropy
    
    # Second pass: compute trajectories for all tracked tokens
    for pos in range(n_positions):
        tracked_indices = list(tokens_to_track[pos])
        
        for token_idx in tracked_indices:
            token_str = tokenizer.decode(token_idx)
            trajectory = []
            
            for layer_idx, logits in enumerate(all_logits):
                layer_logits = logits[0, pos, :]  # [vocab]
                probs = torch.nn.functional.softmax(layer_logits, dim=-1)
                prob = probs[token_idx].item()
                trajectory.append(round(prob, 5))
            
            tracked[pos][token_str] = trajectory
    
    # Build response
    meta = LogitLensMeta(
        version=2,
        timestamp=datetime.now(timezone.utc).isoformat(),
        model=model_name,
    )
    
    return LogitLensData(
        meta=meta,
        layers=layers,
        input=input_tokens,
        tracked=tracked,
        topk=topk_list,
        entropy=entropy if include_entropy else None,
    )