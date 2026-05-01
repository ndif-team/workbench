"""Commitment-strip backend — request/response shape tests."""
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


from workbench._api.routes.commitment_strip_models import (
    CommitmentStripRequest,
    CommitmentStripData,
)


def test_request_validates():
    req = CommitmentStripRequest(
        model="openai-community/gpt2",
        prompt="The Eiffel Tower is in",
        completion=" the city of Paris.",
        top_k=5,
    )
    assert req.top_k == 5


def test_response_round_trips_top_k_shape():
    data = CommitmentStripData(
        prompt="The Eiffel Tower is in",
        completion_text=" the city of Paris.",
        completion_tokens=[
            {"idx": 0, "id": 262, "text": " the", "targetIds": [262]},
            {"idx": 1, "id": 1748, "text": " city", "targetIds": [1748]},
        ],
        model="openai-community/gpt2",
        num_layers=4,
        per_position_per_layer_top_k=[
            [
                [{"token_id": 257, "token_text": " a", "probability": 0.21}],
                [{"token_id": 262, "token_text": " the", "probability": 0.71}],
                [{"token_id": 262, "token_text": " the", "probability": 0.91}],
                [{"token_id": 262, "token_text": " the", "probability": 0.96}],
            ],
            [
                [{"token_id": 1748, "token_text": " city", "probability": 0.12}],
                [{"token_id": 1748, "token_text": " city", "probability": 0.62}],
                [{"token_id": 1748, "token_text": " city", "probability": 0.78}],
                [{"token_id": 1748, "token_text": " city", "probability": 0.86}],
            ],
        ],
    )
    dumped = data.model_dump(by_alias=True)
    # outer = positions; inner = layers; innermost = top_k entries
    assert len(dumped["per_position_per_layer_top_k"]) == 2
    assert len(dumped["per_position_per_layer_top_k"][0]) == 4
    assert dumped["completion_tokens"][0]["targetIds"] == [262]
