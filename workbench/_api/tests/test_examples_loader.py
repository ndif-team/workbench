"""Smoke tests for the workshop examples loader.

The loader is a thin file-reader; we round-trip each fixture INIF through the
Pydantic schemas to catch schema drift.
"""
import json
import sys
from pathlib import Path

import pytest


# Make the workbench package importable when running pytest from any cwd.
_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


from fastapi import HTTPException

from workbench._api.data_models import (
    BranchingGenerationSet,
    CommitmentStripPayload,
    PromptInfluencePayload,
)
from workbench._api.routes.examples import (
    EXAMPLES_DIR,
    _load_payload_from_disk,
    list_examples,
    get_example,
)


@pytest.mark.asyncio
async def test_loader_returns_branching_fixture():
    payload = await get_example("branching_demo_fixture")
    assert payload["record_type"] == "branching_generation_set"
    assert payload["example_id"] == "branching_demo_fixture"
    assert len(payload["samples"]) == 3
    BranchingGenerationSet.model_validate(payload)


@pytest.mark.asyncio
async def test_loader_returns_commitment_strip_fixture():
    payload = await get_example("commitment_strip_fixture")
    assert payload["record_type"] == "commitment_strip"
    assert payload["num_layers"] == 4
    assert len(payload["per_position_per_layer_top_k"]) == len(payload["completion_tokens"])
    CommitmentStripPayload.model_validate(payload)


@pytest.mark.asyncio
async def test_loader_returns_prompt_influence_fixture():
    payload = await get_example("prompt_influence_fixture")
    assert payload["record_type"] == "prompt_influence"
    assert payload["method"] == "attention_rollup"
    PromptInfluencePayload.model_validate(payload)


@pytest.mark.asyncio
async def test_loader_404_for_missing_id():
    with pytest.raises(HTTPException) as exc:
        await get_example("does_not_exist")
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_loader_400_on_path_traversal():
    for bad_id in ["../etc/passwd", "subdir/foo", ".hidden"]:
        with pytest.raises(HTTPException) as exc:
            await get_example(bad_id)
        assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_list_examples_groups_by_record_type():
    listing = await list_examples()
    grouped = listing["examples"]
    assert "branching_demo_fixture" in grouped["branching_generation_set"]
    assert "commitment_strip_fixture" in grouped["commitment_strip"]
    assert "prompt_influence_fixture" in grouped["prompt_influence"]


def test_examples_dir_exists():
    assert EXAMPLES_DIR.is_dir()
    fixtures = sorted(p.name for p in EXAMPLES_DIR.glob("*.json"))
    assert "branching_demo_fixture.json" in fixtures
    assert "commitment_strip_fixture.json" in fixtures
    assert "prompt_influence_fixture.json" in fixtures


def test_loader_500_on_unknown_record_type(tmp_path, monkeypatch):
    # Reach the module via sys.modules. routes/__init__.py's
    # `from .examples import router as examples` shadows the submodule name on
    # the parent package, so plain `import` returns the router. sys.modules is
    # keyed by fully-qualified module path and is not affected.
    import sys

    examples_module = sys.modules["workbench._api.routes.examples"]

    bad = tmp_path / "bad_example.json"
    bad.write_text(json.dumps({"record_type": "totally_made_up", "example_id": "bad"}))
    monkeypatch.setattr(examples_module, "EXAMPLES_DIR", tmp_path)
    with pytest.raises(HTTPException) as exc:
        _load_payload_from_disk("bad_example")
    assert exc.value.status_code == 500
