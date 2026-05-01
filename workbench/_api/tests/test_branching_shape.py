"""Branching backend — request/response shape tests.

Heavy NDIF integration is exercised in CI via the E2E backend boot. These
tests validate Pydantic contracts so drift is caught locally.
"""
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


from workbench._api.routes.branching_models import (
    BranchingGenerateRequest,
    BranchingGenerateData,
    BranchingSampleData,
    BranchingContinueRequest,
    BranchingContinueData,
)


def test_request_models_validate_minimum_payload():
    req = BranchingGenerateRequest(
        model="openai-community/gpt2",
        prompt="The capital of France is",
        samples=[{"temperature": 0.7, "seed": 0}],
        max_tokens=10,
        top_k=5,
    )
    assert req.samples[0].temperature == 0.7
    assert req.max_tokens == 10


def test_request_rejects_empty_samples():
    with pytest.raises(Exception):
        BranchingGenerateRequest(
            model="openai-community/gpt2",
            prompt="x",
            samples=[],
        )


def test_request_caps_samples_at_5():
    with pytest.raises(Exception):
        BranchingGenerateRequest(
            model="openai-community/gpt2",
            prompt="x",
            samples=[{"temperature": 0.4 + i * 0.1, "seed": i} for i in range(6)],
        )


def test_continue_request_minimum_payload():
    req = BranchingContinueRequest(
        model="openai-community/gpt2",
        prompt="The capital of France is",
        prefix_token_ids=[262, 1748],
        forced_next_token_id=6342,
        max_tokens=20,
    )
    assert req.forced_next_token_id == 6342


def test_response_data_validates_with_alias_round_trip():
    sample = BranchingSampleData(
        temperature=0.7,
        seed=0,
        completion_text=" Paris.",
        completion_tokens=[
            {"idx": 0, "id": 6342, "text": " Paris", "targetIds": [6342]},
            {"idx": 1, "id": 13, "text": ".", "targetIds": [13]},
        ],
        per_position_top_k=[
            [{"token_id": 6342, "token_text": " Paris", "probability": 0.91}],
            [{"token_id": 13, "token_text": ".", "probability": 0.62}],
        ],
    )
    data = BranchingGenerateData(
        prompt="The capital of France is",
        model="openai-community/gpt2",
        samples=[sample],
    )
    dumped = data.model_dump(by_alias=True)
    assert dumped["samples"][0]["completion_tokens"][0]["targetIds"] == [6342]
    assert dumped["samples"][0]["per_position_top_k"][0][0]["token_id"] == 6342
