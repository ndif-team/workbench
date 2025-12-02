import pytest
import requests

from typing import Tuple

from ..data_models.tools.activation_patching import ActivationPatchingRequest
from ..data_models.tools.metrics import Metrics

from .utils import get_expected_result, request_tool


@pytest.fixture(scope="module")
def model(model_name: str = "openai-community/gpt2") -> str:
    response = requests.get("http://localhost:8000/models/", headers={"X-User-Email": "test@test.com"})
    assert response.status_code == 200

    response = response.json()
    assert any([model_name==model["name"] for model in response["logit-lens"]])
    
    return model_name


@pytest.fixture()
def source() -> Tuple[str, int]:
    return ("Meghan Rapinoe plays the sport of", 5)


@pytest.fixture()
def target() -> Tuple[str, int]:
    return ("Shaquille O'Neal plays the sport of", 5)


def test_line_probability(remote: bool, model: str, source: Tuple[str, int], target: Tuple[str, int]):
    request = {
        "model": model,
        "srcPrompt": source[0],
        "srcPosition": source[1],
        "tgtPrompt": target[0],
        "tgtPosition": target[1],
        "metric": Metrics.PROBABILITY,
    }
    
    response = request_tool(remote, "activation-patching", "line", request)
    
    assert response.status_code == 200
