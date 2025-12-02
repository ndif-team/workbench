import pytest
import requests

from ..data_models.tools.concept_lens import ConceptLensRequest

from .utils import get_expected_result, request_tool


@pytest.fixture(scope="module")
def model(model_name: str = "meta-llama/Llama-2-7b-hf") -> str:
    response = requests.get("http://localhost:8000/models/", headers={"X-User-Email": "test@test.com"})
    assert response.status_code == 200

    response = response.json()
    assert any([model_name==model["name"] for model in response])
    
    return model_name


@pytest.fixture()
def prompt() -> str:
    return "the secret meeting of the cardinals"


def test_heatmap_probability(remote: bool, model: str, prompt: str):
    request = ConceptLensRequest(
        model=model,
        prompt=prompt,
    ).model_dump()

    request["tokenPosition"] = -1

    result = request_tool(remote, "concept-lens", "heatmap", request)
    expected_result = get_expected_result("concept-lens/heatmap_probability")

    assert result == expected_result
