from typing import Literal, Optional

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class NDIFResponse(BaseModel):
    job_id: str | None = None


class Token(BaseModel):
    idx: int
    id: int
    text: str
    target_ids: list[int] = Field(alias="targetIds")


# ============================================================================
# INIF — Workshop pre-cached payload record types.
#
# These are the on-disk schemas for workshop example payloads loaded by
# GET /examples/{example_id}. Spec source: workbench-features-spec-2026-04-30.md
# §1.4 (branching), §2.4 (commitment_strip), §3.4 (prompt_influence).
# ============================================================================


class TopKLogit(BaseModel):
    """A single (token_id, token_text, probability) triple at a given position/layer."""

    token_id: int
    token_text: str
    probability: float


class BranchingSample(BaseModel):
    """One trajectory inside a branching_generation_set."""

    temperature: float
    seed: int
    completion_tokens: list[Token]
    completion_text: str
    # per_position_top_k[position_idx] = list[TopKLogit] of length K
    per_position_top_k: list[list[TopKLogit]]


class BranchingDrillDown(BaseModel):
    """A pre-computed alternate trajectory at one drill-down position.

    Lets the workshop demo's drill-down view render an alternative continuation
    instantly instead of waiting for a live KV-resume call.
    """

    sample_idx: int
    branch_position: int
    forced_token_id: int
    forced_token_text: str
    continuation_tokens: list[Token]
    continuation_text: str
    per_position_top_k: list[list[TopKLogit]]


class BranchingGenerationSet(BaseModel):
    """Pre-cached payload for a Feature A side-by-side comparison demo."""

    record_type: Literal["branching_generation_set"] = "branching_generation_set"
    example_id: str
    prompt: str
    model: str
    max_tokens: int
    samples: list[BranchingSample]
    drill_downs: list[BranchingDrillDown] = []
    critical_framing_prompt: Optional[str] = None
    pedagogical_narrative: Optional[str] = None
    risk_flag: Optional[str] = None


class CommitmentStripPayload(BaseModel):
    """Pre-cached payload for a Feature B sequence-wide logit lens render."""

    record_type: Literal["commitment_strip"] = "commitment_strip"
    example_id: str
    prompt: str
    completion_text: str
    completion_tokens: list[Token]
    model: str
    num_layers: int
    # per_position_per_layer_top_k[position_idx][layer_idx] = list[TopKLogit] of length K
    per_position_per_layer_top_k: list[list[list[TopKLogit]]]
    critical_framing_prompt: Optional[str] = None
    pedagogical_narrative: Optional[str] = None
    risk_flag: Optional[str] = None


class PromptTokenAttribution(BaseModel):
    """One prompt token's attribution score for a target output token."""

    prompt_position: int
    prompt_token_text: str
    score: float


class PromptInfluencePayload(BaseModel):
    """Pre-cached payload for Feature C (Prompt Influence Tracing).

    Schema-only for Phase 1 — Feature C is deferred to Phase 2 per spec §5
    item 1. Defining the record type here keeps the loader forward-compatible
    so Phase 2 work doesn't have to retrofit data_models.py.
    """

    record_type: Literal["prompt_influence"] = "prompt_influence"
    example_id: str
    prompt: str
    completion_text: str
    completion_tokens: list[Token]
    target_output_position: int
    method: Literal["attention_rollup", "integrated_gradients", "attribution_patching"]
    attributions: list[PromptTokenAttribution]
    critical_framing_prompt: Optional[str] = None
    pedagogical_narrative: Optional[str] = None
    risk_flag: Optional[str] = None


WorkshopExamplePayload = (
    BranchingGenerationSet | CommitmentStripPayload | PromptInfluencePayload
)
