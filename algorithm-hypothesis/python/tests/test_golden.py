"""golden/entity_binding.json is up to date with this package."""

import json

from algorithm_hypothesis.golden import build, build_runtime, default_path, runtime_path


def test_golden_file_is_current():
    path = default_path()
    assert path.exists(), "Run: uv run python -m algorithm_hypothesis.golden"
    assert json.loads(path.read_text()) == json.loads(json.dumps(build(), ensure_ascii=False))


def test_runtime_bundle_is_current():
    path = runtime_path()
    assert path.exists(), "Run: uv run python -m algorithm_hypothesis.golden"
    assert json.loads(path.read_text()) == build_runtime()
