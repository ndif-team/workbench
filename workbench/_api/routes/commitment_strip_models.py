"""Pydantic request/response models for /commitment_strip/*.

Standalone for the same reason as branching_models.py — testable without the
NDIF runtime stack.
"""
from __future__ import annotations

from pydantic import BaseModel

from ..data_models import NDIFResponse, Token


class CommitmentStripRequest(BaseModel):
    model: str
    prompt: str
    completion: str
    top_k: int = 5


class TopKEntry(BaseModel):
    token_id: int
    token_text: str
    probability: float


class CommitmentStripData(BaseModel):
    prompt: str
    completion_text: str
    completion_tokens: list[Token]
    model: str
    num_layers: int
    per_position_per_layer_top_k: list[list[list[TopKEntry]]]


class CommitmentStripResponse(NDIFResponse):
    data: CommitmentStripData | None = None
