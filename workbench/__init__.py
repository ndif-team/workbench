"""
NDIF - National Deep Inference Fabric interpretability workbench.

This package provides tools for interpretability research on large language models,
with efficient data collection optimized for NDIF remote execution.

Example:
    >>> from nnsight import LanguageModel
    >>> from workbench import collect_logit_lens, show_logit_lens
    >>>
    >>> model = LanguageModel("openai-community/gpt2")
    >>> data = collect_logit_lens("The capital of France is", model)
    >>> show_logit_lens(data)
"""

from .logitlens import (
    collect_logit_lens,
    show_logit_lens,
    display_logit_lens,
    to_js_format,
)

__version__ = "0.1.0"

__all__ = [
    "collect_logit_lens",
    "show_logit_lens",
    "display_logit_lens",
    "to_js_format",
]
