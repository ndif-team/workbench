"""Pydantic request/response models for /branching/* endpoints.

Lives in its own module so it can be imported without pulling the heavy NDIF
stack — useful for client codegen, tests, and the workshop pre-cache script.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from ..data_models import NDIFResponse, Token


class SamplingSpec(BaseModel):
    temperature: float
    seed: int = 0
    top_p: float = 1.0


class BranchingGenerateRequest(BaseModel):
    model: str
    prompt: str
    samples: list[SamplingSpec] = Field(..., min_length=1, max_length=5)
    max_tokens: int = 200
    top_k: int = 5


class TopKEntry(BaseModel):
    token_id: int
    token_text: str
    probability: float


class BranchingSampleData(BaseModel):
    temperature: float
    seed: int
    completion_text: str
    completion_tokens: list[Token]
    per_position_top_k: list[list[TopKEntry]]


class BranchingGenerateData(BaseModel):
    prompt: str
    model: str
    samples: list[BranchingSampleData]


class BranchingGenerateResponse(NDIFResponse):
    data: BranchingGenerateData | None = None


class BranchingContinueRequest(BaseModel):
    model: str
    prompt: str
    prefix_token_ids: list[int]
    forced_next_token_id: int
    max_tokens: int = 50
    top_k: int = 5


class BranchingContinueData(BaseModel):
    prompt: str
    model: str
    prefix_token_ids: list[int]
    forced_next_token_id: int
    continuation_text: str
    continuation_tokens: list[Token]
    per_position_top_k: list[list[TopKEntry]]


class BranchingContinueResponse(NDIFResponse):
    data: BranchingContinueData | None = None
