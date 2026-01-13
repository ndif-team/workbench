"""
LogitLens - Efficient logit lens data collection and visualization.

This module provides tools for collecting and visualizing logit lens data
from transformer language models, optimized for NDIF remote execution.

Example:
    >>> from nnsight import LanguageModel
    >>> from workbench import collect_logit_lens, show_logit_lens
    >>>
    >>> model = LanguageModel("openai-community/gpt2")
    >>> data = collect_logit_lens("The capital of France is", model)
    >>> show_logit_lens(data)
"""

from .collect import collect_logit_lens
from .display import show_logit_lens, display_logit_lens, to_js_format

__all__ = [
    "collect_logit_lens",
    "show_logit_lens",
    "display_logit_lens",
    "to_js_format",
]
