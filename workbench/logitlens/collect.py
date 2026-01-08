"""
Logit lens data collection for transformer language models.

This module provides functions to collect logit lens data from transformer
language models using nnsight, optimized for remote execution via NDIF where
bandwidth between server and client is the primary bottleneck.
"""

import torch
from typing import List, Dict, Optional, Any, Union


# Model architecture mappings for common transformer models
# Internal keys use workbench naming conventions: layers, ln_f, lm_head, n_layers
MODEL_MAPPINGS = {
    # Normalized models (via nnsight rename) - all models normalized to this structure
    # This is checked first by _is_normalized_model() before falling back to detection
    "normalized": {
        "layers": "model.layers",
        "ln_f": "model.ln_f",
        "lm_head": "lm_head",
        "n_layers": "n_layers",
    },
    # GPT-2 style models
    "gpt2": {
        "layers": "transformer.h",
        "ln_f": "transformer.ln_f",
        "lm_head": "lm_head",
        "n_layers": "n_layer",
    },
    # GPT-Neo style models
    "gpt_neo": {
        "layers": "transformer.h",
        "ln_f": "transformer.ln_f",
        "lm_head": "lm_head",
        "n_layers": "num_layers",
    },
    # Llama/Mistral style models
    "llama": {
        "layers": "model.layers",
        "ln_f": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "num_hidden_layers",
    },
    # Gemma style models
    "gemma": {
        "layers": "model.layers",
        "ln_f": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "num_hidden_layers",
    },
    # Qwen style models
    "qwen2": {
        "layers": "model.layers",
        "ln_f": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "num_hidden_layers",
    },
    # Phi style models
    "phi": {
        "layers": "model.layers",
        "ln_f": "model.final_layernorm",
        "lm_head": "lm_head",
        "n_layers": "num_hidden_layers",
    },
    # OPT style models
    "opt": {
        "layers": "model.decoder.layers",
        "ln_f": "model.decoder.final_layer_norm",
        "lm_head": "lm_head",
        "n_layers": "num_hidden_layers",
    },
}


def _get_attr_by_path(obj: Any, path: str) -> Any:
    """Get a nested attribute by dot-separated path."""
    for attr in path.split("."):
        obj = getattr(obj, attr)
    return obj


def _has_attr_by_path(obj: Any, path: str) -> bool:
    """Check if a nested attribute exists by dot-separated path."""
    try:
        _get_attr_by_path(obj, path)
        return True
    except AttributeError:
        return False


def _is_normalized_model(model) -> bool:
    """
    Check if a model has been normalized via nnsight's rename feature.

    Normalized models have a standard structure:
    - model.model.layers (layer modules)
    - model.model.ln_f (final layer norm)
    - model.lm_head (language model head)

    This is used by the workbench API to normalize different architectures
    (GPT-2, Llama, etc.) to a common interface.
    """
    return (
        _has_attr_by_path(model, "model.layers") and
        _has_attr_by_path(model, "model.ln_f") and
        _has_attr_by_path(model, "lm_head")
    )


def _detect_model_type(model) -> str:
    """Detect the model architecture type from config."""
    config = model.config
    model_type = getattr(config, "model_type", "").lower()

    # Direct match
    if model_type in MODEL_MAPPINGS:
        return model_type

    # Check architectures list
    architectures = getattr(config, "architectures", [])
    for arch in architectures:
        arch_lower = arch.lower()
        for known_type in MODEL_MAPPINGS:
            if known_type in arch_lower:
                return known_type

    # Check model name
    model_name = getattr(config, "_name_or_path", "").lower()
    for known_type in MODEL_MAPPINGS:
        if known_type in model_name:
            return known_type

    # Default to GPT-2 style
    return "gpt2"


def _get_model_mapping(model, model_type: Optional[str] = None) -> Dict[str, str]:
    """Get the model architecture mapping, auto-detecting if not specified.

    Detection order:
    1. If model_type is explicitly specified, use it
    2. Check if model is normalized (via nnsight rename)
    3. Fall back to architecture detection from config
    """
    if model_type is None:
        # Check for normalized model first (API-style renamed models)
        if _is_normalized_model(model):
            model_type = "normalized"
        else:
            model_type = _detect_model_type(model)
    if model_type not in MODEL_MAPPINGS:
        raise ValueError(
            f"Unknown model_type '{model_type}'. "
            f"Supported types: {list(MODEL_MAPPINGS.keys())}"
        )
    return MODEL_MAPPINGS[model_type]


def _get_num_layers(model, model_type: Optional[str] = None) -> int:
    """Get the number of layers from model config."""
    config = model.config
    mapping = _get_model_mapping(model, model_type)

    n_layers_key = mapping["n_layers"]
    if hasattr(config, n_layers_key):
        return getattr(config, n_layers_key)

    # Fallback: try common attribute names
    for key in ["n_layers", "n_layer", "num_layers", "num_hidden_layers"]:
        if hasattr(config, key):
            return getattr(config, key)

    raise ValueError(f"Could not determine number of layers for model {config._name_or_path}")


def _get_layer_output(model, layer_idx: int, model_type: Optional[str] = None):
    """Get the output of a specific layer during tracing."""
    mapping = _get_model_mapping(model, model_type)
    layers = _get_attr_by_path(model, mapping["layers"])
    return layers[layer_idx].output[0]


def _get_ln_f(model, model_type: Optional[str] = None):
    """Get the final layer norm module."""
    mapping = _get_model_mapping(model, model_type)
    return _get_attr_by_path(model, mapping["ln_f"])


def _get_lm_head(model, model_type: Optional[str] = None):
    """Get the LM head module."""
    mapping = _get_model_mapping(model, model_type)
    return _get_attr_by_path(model, mapping["lm_head"])


def collect_logit_lens(
    prompt: str,
    model,
    k: int = 5,
    layers: Optional[List[int]] = None,
    model_type: Optional[str] = None,
    remote: bool = True,
    backend: Any = None,
    track_tokens: Optional[List[str]] = None,
    track_all_topk: bool = False,
    include_rank: bool = False,
    include_entropy: bool = False,
) -> Union[Dict, str]:
    """
    Collect logit lens data: top-k predictions and probability trajectories.

    This function extracts how the model's predictions evolve across layers
    by projecting intermediate hidden states to vocabulary probabilities.

    Args:
        prompt: Input text to analyze
        model: nnsight LanguageModel
        k: Number of top predictions to track per layer/position (default: 5)
        layers: Specific layer indices to analyze (default: all layers)
        model_type: Model architecture type. Auto-detected if None.
                   Supported: "gpt2", "gpt_neo", "llama", "gemma", "qwen2", "phi", "opt",
                   or "normalized" for models with standard workbench structure.
        remote: Use NDIF remote execution (default: True)
        backend: Optional custom nnsight backend. Used by workbench API for
                non-blocking remote execution. When provided with a non-blocking
                backend, returns job_id string instead of data dict.
        track_tokens: List of token strings to always track trajectories for,
                     in addition to those discovered via top-k (default: None)
        track_all_topk: If True, track the global union of all top-k tokens
                       at every position. If False (default), only track per-position
                       unions. Enabling this produces more complete data but larger output.
        include_rank: If True, compute rank trajectories for tracked tokens (default: False)
        include_entropy: If True, compute entropy at each layer/position (default: False)

    Returns:
        Dict with data (normal case), or str job_id (when using non-blocking backend).
        Dict contains:
            model: Model name/path
            input: List of input token strings
            layers: List of layer indices analyzed
            topk: Tensor[int32] of shape [n_layers, n_positions, k]
            tracked: List of Tensor[int32] per position (unique token indices)
            probs: List of Tensor[float32] per position [n_layers, n_tracked]
            ranks: List of Tensor[int32] per position [n_layers, n_tracked] (if include_rank)
            entropy: Tensor[float32] of shape [n_layers, n_positions] (if include_entropy)
            vocab: Dict mapping token indices to strings

    Data Size Considerations (for NDIF bandwidth optimization):
        Empirically measured JSON sizes:

        GPT-2 (12 layers), 5-13 token prompts:
        - Base: ~15 tracked tokens/position, ~10-30 KB
        - include_rank=True: +45% size
        - include_entropy=True: +5% size
        - track_all_topk=True: 3-6× larger (60-160 tracked tokens/position)
        - track_all_topk + include_rank: 5-12× larger

        Llama 3.1 70B (80 layers), 6-14 token prompts:
        - Base: ~90 tracked tokens/position, 316 KB - 810 KB
        - include_rank=True: +76-81% size (560 KB - 1.4 MB)
        - include_entropy=True: +1% size (minimal overhead)
        - track_all_topk=True: 4-9× larger (1.4 MB - 7.3 MB)
        - track_all_topk + include_rank: 9-20× larger (2.8 MB - 15.8 MB)

        Recommendations:
        - Use include_rank=False unless rank visualization is needed
        - Use track_all_topk=False for most cases (per-position is sufficient)
        - include_entropy=True has minimal overhead, enable if useful

    Example:
        >>> from nnsight import LanguageModel
        >>> model = LanguageModel("openai-community/gpt2")
        >>> data = collect_logit_lens("The capital of France is", model)
        >>> print(data["input"])  # ['The', ' capital', ' of', ' France', ' is']

        # Track specific tokens and include rank data
        >>> data = collect_logit_lens(
        ...     "The capital of France is",
        ...     model,
        ...     track_tokens=[" Paris", " London", " Berlin"],
        ...     include_rank=True
        ... )
    """
    # Tokenize once, client-side
    token_ids = model.tokenizer.encode(prompt)
    n_pos = len(token_ids)

    # Convert track_tokens to token IDs (client-side)
    extra_token_ids = set()
    if track_tokens:
        for token_str in track_tokens:
            # Try to encode the token; handle cases where it might be multiple tokens
            ids = model.tokenizer.encode(token_str, add_special_tokens=False)
            if len(ids) == 1:
                extra_token_ids.add(ids[0])
            else:
                # Token string encodes to multiple tokens; try without leading space
                # or warn user
                pass  # Silently skip multi-token strings for now

    # Get number of layers
    num_layers = _get_num_layers(model, model_type)

    # Default: all layers
    if layers is None:
        layers = list(range(num_layers))
    n_layers = len(layers)

    # Get module references BEFORE entering trace context to avoid serialization issues.
    # This is critical for NDIF remote execution - functions called inside the trace
    # must not reference local module code that isn't whitelisted on the server.
    mapping = _get_model_mapping(model, model_type)
    layers_module = _get_attr_by_path(model, mapping["layers"])
    ln_f = _get_attr_by_path(model, mapping["ln_f"])
    lm_head = _get_attr_by_path(model, mapping["lm_head"])

    # Extract primitive values before trace context
    k_val = k
    layers_to_process = list(layers)  # Make a copy
    n_layers_val = n_layers
    n_pos_val = n_pos
    do_entropy = include_entropy
    do_rank = include_rank
    do_track_all = track_all_topk
    extra_ids_list = list(extra_token_ids) if extra_token_ids else []

    # Build trace kwargs - include backend if provided
    trace_kwargs = {"remote": remote}
    if backend is not None:
        trace_kwargs["backend"] = backend

    # Run model, compute logit lens (computation happens server-side if remote=True)
    with model.trace(token_ids, **trace_kwargs) as tracer:
        all_probs = []
        all_topk = []
        all_entropy = [] if do_entropy else None

        for li in layers_to_process:
            # Get layer output directly from pre-resolved module
            layer_output = layers_module[li].output[0]
            # Project hidden state to vocabulary: hidden -> norm -> lm_head
            logits = lm_head(ln_f(layer_output))
            # Handle nnsight batch dimension inconsistency (issue #581):
            # Remote execution squeezes batch dim when batch=1.
            # Use squeeze(0) which is safe for both cases:
            # - 3D [1, seq, vocab] -> squeeze(0) -> [seq, vocab]
            # - 2D [seq, vocab] -> squeeze(0) -> [seq, vocab] (no-op)
            logits_2d = logits.squeeze(0)
            probs = torch.softmax(logits_2d, dim=-1)
            all_probs.append(probs)
            all_topk.append(probs.topk(k_val, dim=-1).indices)

            # Compute entropy if requested
            if do_entropy:
                # Entropy = -sum(p * log(p)), handle zeros with small epsilon
                log_probs = torch.log(probs + 1e-10)
                entropy = -torch.sum(probs * log_probs, dim=-1)
                all_entropy.append(entropy)

        # Stack top-k indices: [n_layers, n_pos, k]
        topk = torch.stack(all_topk).to(torch.int32)

        # Stack entropy if computed: [n_layers, n_pos]
        entropy_tensor = torch.stack(all_entropy) if do_entropy else None

        # Determine which tokens to track
        if do_track_all:
            # Global union: all tokens appearing in top-k anywhere
            global_unique = torch.unique(topk.flatten()).to(torch.int32)
            # Add extra tracked tokens
            if extra_ids_list:
                extra_tensor = torch.tensor(extra_ids_list, dtype=torch.int32)
                global_unique = torch.unique(torch.cat([global_unique, extra_tensor]))

        # For each position: extract trajectories for tracked tokens
        tracked = []
        probs_out = []
        ranks_out = [] if do_rank else None

        for pos in range(n_pos_val):
            if do_track_all:
                # Use global set for all positions
                unique = global_unique
            else:
                # Per-position union of top-k tokens
                unique = torch.unique(topk[:, pos, :].flatten()).to(torch.int32)
                # Add extra tracked tokens
                if extra_ids_list:
                    extra_tensor = torch.tensor(extra_ids_list, dtype=torch.int32)
                    unique = torch.unique(torch.cat([unique, extra_tensor]))

            # Extract probability trajectory for each tracked token
            traj = torch.stack([all_probs[li][pos, unique] for li in range(n_layers_val)])
            tracked.append(unique)
            probs_out.append(traj)

            # Compute ranks if requested
            if do_rank:
                # Rank = position when sorted by probability (descending)
                # For each layer, compute rank of each tracked token
                # Ranks are 1-indexed (rank 1 = highest probability)
                rank_traj = []
                for li in range(n_layers_val):
                    # Get full probability distribution for this position
                    pos_probs = all_probs[li][pos]
                    # Sort indices by probability (descending)
                    sorted_indices = torch.argsort(pos_probs, descending=True)
                    # Create rank tensor (rank 1 = highest prob, 1-indexed)
                    ranks = torch.zeros_like(sorted_indices)
                    ranks[sorted_indices] = torch.arange(1, len(sorted_indices) + 1, device=ranks.device)
                    # Extract ranks for tracked tokens
                    rank_traj.append(ranks[unique])
                ranks_out.append(torch.stack(rank_traj).to(torch.int32))

        # Build result dict to save
        result_dict = {"topk": topk, "tracked": tracked, "probs": probs_out}
        if do_rank:
            result_dict["ranks"] = ranks_out
        if do_entropy:
            result_dict["entropy"] = entropy_tensor

        # Save results to transmit from server
        result = result_dict.save()

    # Check if using non-blocking backend (API pattern) - return job_id
    if backend is not None and hasattr(tracer, 'backend') and hasattr(tracer.backend, 'job_id'):
        job_id = tracer.backend.job_id
        if job_id is not None:
            return job_id

    # Build vocabulary map (client-side, only for tracked tokens)
    all_ids = set(result["topk"].flatten().tolist())
    for t in result["tracked"]:
        all_ids.update(t.tolist())
    vocab = {i: model.tokenizer.decode([i]) for i in all_ids}

    # Get model name
    model_name = getattr(model.config, '_name_or_path',
                         getattr(model.config, 'name_or_path', 'unknown'))

    output = {
        "model": model_name,
        "input": [model.tokenizer.decode([t]) for t in token_ids],
        "layers": layers,
        "topk": result["topk"],
        "tracked": result["tracked"],
        "probs": result["probs"],
        "vocab": vocab,
    }

    if include_rank:
        output["ranks"] = result["ranks"]
    if include_entropy:
        output["entropy"] = result["entropy"]

    return output
