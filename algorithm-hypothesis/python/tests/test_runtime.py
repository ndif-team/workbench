"""Custom Python functions run one call at a time (the browser's path), the
runtime bundle for Pyodide, and display fields (color, tags) and saved inputs."""

import json
import subprocess
import sys

from algorithm_hypothesis import Algorithm, Function, compile_algorithm, show, tokenize_abstract
from algorithm_hypothesis import runtime
from algorithm_hypothesis.golden import PROMPTS, PYTHON_CALLS
from algorithm_hypothesis.presets import entity_binding
from algorithm_hypothesis.primitives import PRIMITIVES

TARGET = tokenize_abstract(PROMPTS["target"])
SOURCE = tokenize_abstract(PROMPTS["source"])
LAST = len(TARGET) - 1


def test_calls_return_json_values_or_errors():
    results = [runtime.call(c["source"], c["args"], TARGET, c["type"]) for c in PYTHON_CALLS]
    assert results[0] == {"ok": True, "value": "ALE"}
    assert results[1]["value"] == {"kind": "token", "text": "jam", "index": 6}
    assert results[2] == {"ok": True, "value": 2}  # template passed to a `template` parameter
    assert results[4] == {"ok": False, "error": "ZeroDivisionError: division by zero (line 2)"}
    assert "a list" in results[5]["error"]
    assert results[6]["error"] == "compute returned 'ale' (a string), but this variable is a position ID."
    assert results[7]["error"].startswith("SyntaxError")
    assert results[8]["error"] == "The Python source must define compute(...)."


def test_batch_entry_point():
    out = json.loads(runtime.call_batch(json.dumps([{"id": "a", **PYTHON_CALLS[0]}, {"id": "b", **PYTHON_CALLS[4]}])))
    assert [r["id"] for r in out] == ["a", "b"]
    assert out[0]["ok"] and not out[1]["ok"]


def test_every_primitive_source_runs_in_the_runtime():
    """'Edit as Python' starts from a primitive's source; it must run as is."""
    jam = {"kind": "token", "text": "jam", "index": 6}
    ale = {"kind": "token", "text": "ale", "index": 2}
    joe = {"kind": "token", "text": "Joe", "index": 4}
    ann = {"kind": "token", "text": "Ann", "index": 0}
    cases = {
        "position_id": ({"token": joe, "specials": [ann, joe]}, {"kind": "pair", "key": 2, "value": joe}),
        "retrieve": ({"key": 2, "pairs": [{"kind": "pair", "key": 1, "value": ale}, {"kind": "pair", "key": 2, "value": jam}]}, jam),
        "index": ({"i": 2, "values": [ale, jam]}, jam),
        "key_of": ({"pair": {"kind": "pair", "key": 2, "value": joe}}, 2),
        "value_of": ({"pair": {"kind": "pair", "key": 2, "value": joe}}, joe),
    }
    for name, (args, expected) in cases.items():
        source = PRIMITIVES[name].source.replace(f"def {name}(", "def compute(")
        assert runtime.call(source, args, TARGET) == {"ok": True, "value": expected}, name
    mixture = PRIMITIVES["mixture"].source.replace("def mixture(", "def compute(")
    out = runtime.call(mixture.replace('weights: str = ""', 'weights: str = "2, 1"'), {"answers": [ale, jam, ale]}, TARGET)
    assert out == {"ok": True, "value": {"kind": "distribution", "items": [{"label": "ale", "p": 0.75}, {"label": "jam", "p": 0.25}]}}


def test_runtime_matches_the_compiled_model():
    """The same Python variable, run by causalab and by the runtime, agrees."""
    alg = entity_binding("positional", TARGET, 8, template=PROMPTS["target"])
    source = PRIMITIVES["retrieve"].source.replace("def retrieve(", "def compute(")
    answer = alg.by_id()["answer"]
    answer.function = Function("python", source=source)
    answer.type = {"kind": "string"}
    compiled = compile_algorithm(alg, TARGET)
    assert show(compiled.output(compiled.run(TARGET))) == "tea"
    assert show(compiled.interchange_intervention(SOURCE, TARGET, (5, LAST), (5, LAST)).output) == "jam"


def test_bundle_runs_without_causalab(tmp_path):
    package = tmp_path / "algorithm_hypothesis"
    package.mkdir()
    for name, source in runtime.python_runtime_files().items():
        (package / name).write_text(source)
    script = (
        "import json, sys\n"
        "from algorithm_hypothesis import runtime\n"
        "assert 'causalab' not in sys.modules\n"
        "print(runtime.call_batch(json.dumps([{'id': 1, 'source': 'def compute(x):\\n    return x + 1\\n', 'args': {'x': 1}}])))\n"
    )
    out = subprocess.run([sys.executable, "-c", script], cwd=tmp_path, env={"PYTHONPATH": str(tmp_path)}, capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    assert json.loads(out.stdout) == [{"id": 1, "ok": True, "value": 2}]


def test_examples_are_colored_by_the_algorithm_each_variable_serves():
    alg = entity_binding("mixed", TARGET, 8, template=PROMPTS["target"]).by_id()
    assert (alg["q_pos"].color, alg["q_pos"].tags) == ("indigo", ["positional"])
    assert (alg["P"].color, alg["L"].color, alg["R"].color) == ("indigo", "emerald", "amber")
    assert [alg[f"{p}_answer"].color for p in ("pos", "lex", "ref")] == ["indigo", "emerald", "amber"]
    assert (alg["pos_bind1"].color, alg["bind1"].color, alg["bind1"].tags) == ("indigo", None, ["lexical", "reflexive"])
    assert (alg["answer"].color, alg["answer"].tags) == (None, [])
    # Alone, each algorithm colors what only it uses; the shared bindings stay black.
    pos = entity_binding("positional", TARGET, 8, template=PROMPTS["target"]).to_dict()
    assert all(v.get("color") == "indigo" for v in pos["variables"])
    for kind, color in (("lexical", "emerald"), ("reflexive", "amber")):
        alone = entity_binding(kind, TARGET, 8, template=PROMPTS["target"]).to_dict()["variables"]
        assert [v["id"] for v in alone if "color" not in v] == ["bind1", "bind2", "bind3", "bind4"]
        assert {v.get("color") for v in alone if not v["id"].startswith("bind")} == {color}


def test_color_tags_and_inputs_round_trip():
    a = entity_binding("mixed", TARGET, 8, template=PROMPTS["target"])
    a.inputs = [PROMPTS["source"], PROMPTS["source_cod"]]
    a.by_id()["answer"].color = "#123abc"
    d = a.to_dict()
    assert d["inputs"] == [PROMPTS["source"], PROMPTS["source_cod"]]
    assert Algorithm.from_dict(d).to_dict() == d
