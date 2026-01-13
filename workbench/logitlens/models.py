"""
Model configuration registry for different transformer architectures.

Each model family has different internal structure (layer paths, norm type, etc.).
This registry provides a unified interface for accessing model components.
"""

import inspect
from typing import Dict, Any, Optional, Union, Callable


# =============================================================================
# Model Configuration Registry
# =============================================================================
#
# Each entry maps a model type to its architecture-specific accessors.
# Values can be:
#   - String: Dot-separated path (e.g., "model.layers")
#   - Callable: Function taking model (and optionally hidden state)
#
# Required keys:
#   - layers: Path to layer list/ModuleList
#   - norm: Final layer norm (module or callable(model, hidden) -> normalized)
#   - lm_head: Language model head (module or weight matrix)
#   - n_layers: Number of layers (string path to config attr, or callable)

MODEL_CONFIGS: Dict[str, Dict[str, Any]] = {
    "llama": {
        "layers": "model.layers",
        "norm": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "config.num_hidden_layers",
    },
    "mistral": {
        "layers": "model.layers",
        "norm": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "config.num_hidden_layers",
    },
    "qwen2": {
        "layers": "model.layers",
        "norm": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "config.num_hidden_layers",
    },
    "gpt2": {
        "layers": "transformer.h",
        "norm": "transformer.ln_f",
        "lm_head": "lm_head",
        "n_layers": "config.n_layer",
    },
    "gptj": {
        "layers": "transformer.h",
        "norm": "transformer.ln_f",
        "lm_head": "lm_head",
        "n_layers": "config.n_layer",
    },
    "gpt_neox": {
        "layers": "gpt_neox.layers",
        "norm": "gpt_neox.final_layer_norm",
        "lm_head": "embed_out",
        "n_layers": "config.num_hidden_layers",
    },
    "olmo": {
        "layers": "model.transformer.blocks",
        "norm": "model.transformer.ln_f",
        "lm_head": "model.transformer.ff_out",
        "n_layers": "config.n_layers",
    },
    "phi": {
        "layers": "model.layers",
        "norm": "model.final_layernorm",
        "lm_head": "lm_head",
        "n_layers": "config.num_hidden_layers",
    },
    "gemma": {
        "layers": "model.layers",
        "norm": "model.norm",
        "lm_head": "lm_head",
        "n_layers": "config.num_hidden_layers",
    },
}

# Aliases for common model names
MODEL_ALIASES: Dict[str, str] = {
    "llama2": "llama",
    "llama3": "llama",
    "codellama": "llama",
    "pythia": "gpt_neox",
    "gpt-j": "gptj",
    "gpt-neox": "gpt_neox",
    "qwen": "qwen2",
    "gemma2": "gemma",
    "phi3": "phi",
    "phi-3": "phi",
}


def resolve_accessor(model, accessor: Union[str, Callable]) -> Any:
    """
    Resolve an accessor to get a module, value, or callable result.

    Args:
        model: The nnsight LanguageModel
        accessor: Either a dot-separated path string or a callable

    Returns:
        The resolved module, attribute, or callable result

    Examples:
        >>> resolve_accessor(model, "model.layers")  # Returns layers ModuleList
        >>> resolve_accessor(model, "config.num_hidden_layers")  # Returns int
        >>> resolve_accessor(model, lambda m: m.custom.path)  # Callable
    """
    if callable(accessor):
        return accessor(model)

    # String path traversal
    obj = model
    for attr in accessor.split("."):
        obj = getattr(obj, attr)
    return obj


def apply_module_or_callable(model, accessor: Union[str, Callable], hidden):
    """
    Apply a norm or lm_head accessor to hidden states.

    Handles three cases:
    1. String path to a module -> resolve and call module(hidden)
    2. Callable(model) returning a module -> call module(hidden)
    3. Callable(model, hidden) -> call directly with hidden
    4. Callable(model) returning weight matrix -> hidden @ weights

    Args:
        model: The nnsight LanguageModel
        accessor: String path or callable
        hidden: Hidden state tensor to process

    Returns:
        Processed tensor (normalized or logits)
    """
    if callable(accessor):
        # Check if it's a callable that takes hidden directly
        sig = inspect.signature(accessor)
        if len(sig.parameters) >= 2:
            # Callable(model, hidden) -> direct application
            return accessor(model, hidden)
        else:
            # Callable(model) -> returns module or weights
            resolved = accessor(model)
    else:
        # String path -> resolve to module
        resolved = resolve_accessor(model, accessor)

    # Now apply the resolved object
    if hasattr(resolved, 'forward') or hasattr(resolved, '__call__'):
        # It's a module, call it
        return resolved(hidden)
    else:
        # Assume it's a weight matrix (for tied embeddings)
        return hidden @ resolved


def detect_model_type(model) -> str:
    """
    Auto-detect model type from config.

    Args:
        model: nnsight LanguageModel

    Returns:
        Model type string (key in MODEL_CONFIGS)

    Raises:
        ValueError: If model type cannot be detected
    """
    # Try model_type from config
    model_type = getattr(model.config, "model_type", "").lower()

    # Check direct match
    if model_type in MODEL_CONFIGS:
        return model_type

    # Check aliases
    if model_type in MODEL_ALIASES:
        return MODEL_ALIASES[model_type]

    # Try architectures field
    archs = getattr(model.config, "architectures", [])
    for arch in archs:
        arch_lower = arch.lower()
        for key in MODEL_CONFIGS:
            if key in arch_lower:
                return key
        for alias, target in MODEL_ALIASES.items():
            if alias.replace("-", "").replace("_", "") in arch_lower:
                return target

    raise ValueError(
        f"Unknown model type: {model_type}. "
        f"Supported types: {list(MODEL_CONFIGS.keys())}. "
        f"You can pass model_type explicitly or add a config to MODEL_CONFIGS."
    )


def get_model_config(model, model_type: Optional[str] = None) -> Dict[str, Any]:
    """
    Get model configuration, auto-detecting if not specified.

    Args:
        model: nnsight LanguageModel
        model_type: Explicit model type, or None to auto-detect

    Returns:
        Configuration dict with layers, norm, lm_head, n_layers accessors
    """
    if model_type is None:
        model_type = detect_model_type(model)

    model_type = model_type.lower()
    if model_type in MODEL_ALIASES:
        model_type = MODEL_ALIASES[model_type]

    if model_type not in MODEL_CONFIGS:
        raise ValueError(f"Unknown model type: {model_type}")

    return MODEL_CONFIGS[model_type]
