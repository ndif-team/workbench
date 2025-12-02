import pytest
import requests

from ..data_models.tools.logit_lens import LogitLensRequest
from ..src.tools.metrics import Metrics

from .utils import request_tool, get_expected_result


@pytest.fixture(scope="module")
def model_loaded(model_name: str = "openai-community/gpt2") -> str:
    response = requests.get("http://localhost:8000/models/", headers={"X-User-Email": "test@test.com"})
    assert response.status_code == 200

    response = response.json()
    assert any([model_name==model["name"] for model in response])
    
    return model_name


@pytest.fixture()
def prompt() -> str:
    return "The Eiffel Tower is located in the city of"


def test_heatmap_probability(remote: bool, model_loaded: str, prompt: str):
    request = LogitLensRequest(
        model=model_loaded,
        prompt=prompt,
        metric=Metrics.PROBABILITY,
    )

    result = request_tool(remote, "logit-lens", "heatmap", request.model_dump())
    expected_result = get_expected_result("logit-lens/heatmap_probability")

    assert result == expected_result
    

def test_heatmap_rank(remote: bool,model_loaded: str, prompt: str):
    request = LogitLensRequest(
        model=model_loaded,
        prompt=prompt,
        metric=Metrics.RANK,
    )

    result = request_tool(remote, "logit-lens", "heatmap", request.model_dump())
    expected_result = get_expected_result("logit-lens/heatmap_rank")

    assert result == expected_result

def test_heatmap_entropy(remote: bool, model_loaded: str, prompt: str):
    request = LogitLensRequest(
        model=model_loaded,
        prompt=prompt,
        metric=Metrics.ENTROPY,
    )

    result = request_tool(remote, "logit-lens", "heatmap", request.model_dump())
    expected_result = get_expected_result("logit-lens/heatmap_entropy")

    assert result == expected_result

def test_line_probability(remote: bool, model_loaded: str, prompt: str):
    request = LogitLensRequest(
        model=model_loaded,
        prompt=prompt,
        metric=Metrics.PROBABILITY,
    )

    request = request.model_dump()
    request["tokenPosition"] = 10
    request["targetIds"] = [6342, 3576, 2031]

    result = request_tool(remote, "logit-lens", "line", request)
    expected_result = get_expected_result("logit-lens/line_probability")

    assert result == expected_result

def test_line_rank(remote: bool, model_loaded: str, prompt: str):
    request = LogitLensRequest(
        model=model_loaded,
        prompt=prompt,
        metric=Metrics.RANK
    )

    request = request.model_dump()
    request["tokenPosition"] = 10
    request["targetIds"] = [6342, 3576, 2031]

    result = request_tool(remote, "logit-lens", "line", request)
    expected_result = get_expected_result("logit-lens/line_rank")

    assert result == expected_result
