"""Write golden/entity_binding.json: the paper's algorithms and their sweeps,
and golden/python_runtime.json: the modules workbench's Pyodide worker loads.

The files are the contract between this package and workbench. Both test suites
load them; regenerate with

    uv run python -m algorithm_hypothesis.golden

then copy both into workbench (see the README).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from algorithm_hypothesis.compile import compile_algorithm
from algorithm_hypothesis.placement import tokenize_abstract
from algorithm_hypothesis.presets import KINDS, entity_binding
from algorithm_hypothesis import runtime
from algorithm_hypothesis.primitives import PRIMITIVES
from algorithm_hypothesis.values import show

PROMPTS = {
    "target": "Ann loves ale, Joe loves jam, Pete loves pie, Tim loves tea. What does Tim love?",
    "source": "Joe loves ale, Ann loves pie, Pete loves jam, Tim loves tea. What does Ann love?",
    "source_cod": "Joe loves ale, Ann loves cod, Pete loves jam, Tim loves tea. What does Ann love?",
}


# Calls of custom Python functions, run by runtime.call in CPython here and in
# Pyodide by the spike and workbench's worker.
PYTHON_CALLS = [
    {"source": "def compute(word: str) -> str:\n    return str(word).upper()\n", "args": {"word": {"kind": "token", "text": " ale", "index": 2}}, "type": {"kind": "string"}},
    {"source": "def compute(key, pairs):\n    for p in pairs:\n        if p.key == key:\n            return p.value\n    return None\n", "args": {"key": 2, "pairs": [{"kind": "pair", "key": 1, "value": {"kind": "token", "text": "ale", "index": 2}}, {"kind": "pair", "key": 2, "value": {"kind": "token", "text": "jam", "index": 6}}]}, "type": {"kind": "string"}},
    {"source": "def compute(token, template):\n    return 1 + sum(1 for t in template[: token.index] if t == ',')\n", "args": {"token": {"kind": "token", "text": "Joe", "index": 4}}, "type": {"kind": "position"}},
    {"source": "def compute(a, b):\n    return Pair(a, Pair(b, a))\n", "args": {"a": 1, "b": "x"}, "type": {"kind": "pair", "key": {"kind": "position"}, "value": {"kind": "pair", "key": {"kind": "string"}, "value": {"kind": "position"}}}},
    {"source": "def compute(x):\n    return x / 0\n", "args": {"x": 1}, "type": {"kind": "int"}},
    {"source": "def compute(x):\n    return [x]\n", "args": {"x": 1}, "type": {"kind": "int"}},
    {"source": "def compute(x):\n    return 'ale'\n", "args": {"x": 1}, "type": {"kind": "position"}},
    {"source": "def compute(x)\n    return x\n", "args": {"x": 1}, "type": {"kind": "int"}},
    {"source": "def helper(x):\n    return x\n", "args": {}, "type": {"kind": "int"}},
]


def default_path() -> Path:
    """golden/entity_binding.json at the root of the algorithm-hypothesis project."""
    return Path(__file__).resolve().parents[3] / "golden" / "entity_binding.json"


def build() -> dict:
    tokens = {k: tokenize_abstract(v) for k, v in PROMPTS.items()}
    target = tokens["target"]
    out: dict = {
        "prompts": PROMPTS,
        "tokens": tokens,
        "primitives": {
            name: {
                "label": p.label,
                "slots": [{"name": s.name, "type": s.type} for s in p.slots],
                "returns": p.returns,
                "options": [{"name": o.name, "default": o.default, "choices": list(o.choices) if o.choices else None} for o in p.options],
                "source": p.source,
            }
            for name, p in PRIMITIVES.items()
        },
        "python_calls": [
            {**c, "result": runtime.call(c["source"], c["args"], tokens["target"], c["type"])} for c in PYTHON_CALLS
        ],
        "algorithms": {},
        "base_outputs": {},
        "sweeps": [],
        "full": [],
    }
    configs = [(kind, 8) for kind in KINDS] + [("positional", 26)]
    for kind, layers in configs:
        name = f"{kind}_{layers}"
        alg = entity_binding(kind, target, layers, template=PROMPTS["target"])
        out["algorithms"][name] = alg.to_dict()
        compiled = compile_algorithm(alg, target)
        out["base_outputs"][name] = show(compiled.output(compiled.run(target)))
        for source in ("source", "source_cod"):
            for label, tok in (("last", len(target) - 1), ("query", target.index("Tim", 12))):
                rows = compiled.token_sweep(tokens[source], target, tok, tok)
                out["sweeps"].append(
                    {
                        "algorithm": name,
                        "source": source,
                        "token": tok,
                        "label": label,
                        "rows": [{"layer": r.layer, "output": show(r.output), "status": r.status} for r in rows],
                    }
                )
            full = compiled.full_sweep(tokens[source], target)
            out["full"].append(
                {
                    "algorithm": name,
                    "source": source,
                    "outputs": [[show(r.output) for r in col] for col in full],
                    "status": [[r.status for r in col] for col in full],
                }
            )
    return out


def runtime_path() -> Path:
    return default_path().with_name("python_runtime.json")


def build_runtime() -> dict:
    """The worker's Python modules, keyed by file name."""
    return {"package": "algorithm_hypothesis", "files": runtime.python_runtime_files()}


def main(argv: list[str]) -> None:
    path = Path(argv[1]) if len(argv) > 1 else default_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(build(), indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {path}")
    rpath = path.with_name("python_runtime.json")
    rpath.write_text(json.dumps(build_runtime(), indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {rpath}")


if __name__ == "__main__":
    main(sys.argv)
