"""Run custom Python functions one call at a time, without causalab.

Workbench evaluates primitives in TypeScript and sends each call of a custom
Python function to a Pyodide worker, which runs it with this module. The code
generator in compile.py strips functions the same way, so a function behaves the
same in the browser and in a compiled causalab model.

Values cross as JSON, in the shape of the TypeScript engine's values:

    null, number, boolean, string
    {"kind": "token", "text": str, "index": int}
    {"kind": "pair", "key": value, "value": value}
    {"kind": "distribution", "items": [{"label": str, "p": float}]}

The worker ships only values, vartypes, primitives and this module, so nothing
here may import causalab.
"""

from __future__ import annotations

import ast
import json
import math
import sys
import traceback
from typing import Any

from algorithm_hypothesis import primitives as _p
from algorithm_hypothesis.values import Distribution, Pair, Token, show

FILENAME = "<compute>"

# Modules the worker needs, in import order (see python_runtime_files()).
MODULES = ("values", "vartypes", "primitives", "runtime")


class FunctionError(ValueError):
    """The source doesn't define a usable compute()."""


class ReturnError(TypeError):
    """compute returned something a variable can't hold."""


# ----------------------------------------------------------- the function


def strip_function(source: str, name: str) -> tuple[ast.Module, list[str]]:
    """The module `source`, with compute() renamed `name` and its type hints
    removed, and compute's parameter names.

    Type hints document a function in the editor (``key: K``) but would need
    those generic names to evaluate. Line numbers are kept, so errors point at
    the user's own lines.
    """
    try:
        tree = ast.parse(source, filename=FILENAME)
    except SyntaxError as exc:
        raise FunctionError(f"SyntaxError: {exc.msg} (line {exc.lineno})") from exc
    fn = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "compute"), None)
    if fn is None:
        raise FunctionError("The Python source must define compute(...).")
    for node in ast.walk(fn):
        if isinstance(node, ast.arg):
            node.annotation = None
    fn.returns = None
    fn.name = name
    params = [a.arg for a in fn.args.args + fn.args.kwonlyargs]
    return tree, params


def namespace(template: list[str] | tuple[str, ...]) -> dict[str, Any]:
    """What a custom function can use without importing it; the same names as
    the module compile.py generates."""
    return {
        "__name__": "algorithm_hypothesis_function",
        "math": math,
        "Distribution": Distribution,
        "Pair": Pair,
        "Token": Token,
        "show": show,
        "_p": _p,
        "TEMPLATE": tuple(template),
    }


_FUNCTIONS: dict[tuple[str, tuple[str, ...]], tuple[Any, list[str]]] = {}


def load(source: str, template: list[str] | tuple[str, ...] = ()) -> tuple[Any, list[str]]:
    """compute() from `source`, ready to call, and its parameter names."""
    key = (source, tuple(template))
    if key not in _FUNCTIONS:
        if len(_FUNCTIONS) > 256:  # every edit of a function is a new source
            _FUNCTIONS.clear()
        tree, params = strip_function(source, "compute")
        ns = namespace(template)
        exec(compile(tree, FILENAME, "exec"), ns)
        _FUNCTIONS[key] = (ns["compute"], params)
    return _FUNCTIONS[key]


# --------------------------------------------------------------- values


def from_json(v: Any) -> Any:
    if isinstance(v, list):
        return [from_json(x) for x in v]
    if isinstance(v, dict):
        kind = v.get("kind")
        if kind == "token":
            return Token(v["text"], int(v["index"]))
        if kind == "pair":
            return Pair(from_json(v.get("key")), from_json(v.get("value")))
        if kind == "distribution":
            return Distribution(tuple((str(x["label"]), float(x["p"])) for x in v["items"]))
        raise ValueError(f"Unknown value {v!r}.")
    return v


def _describe(v: Any) -> str:
    if isinstance(v, bool):
        return "a bool"
    if isinstance(v, str):
        return "a string"
    if isinstance(v, int):
        return "an int"
    if isinstance(v, Pair):
        return "a key : value pair"
    if isinstance(v, Distribution):
        return "a distribution"
    if isinstance(v, (list, tuple)):
        return "a list"
    name = type(v).__name__
    return f"an {name}" if name[:1].lower() in "aeiou" else f"a {name}"


def to_json(v: Any) -> Any:
    """A returned value as JSON; raises ReturnError for values a variable can't hold."""
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, Token):
        return {"kind": "token", "text": v.raw, "index": v.index}
    if isinstance(v, str):
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if not math.isfinite(v):
            raise ReturnError(f"compute returned {v}, which isn't a finite number.")
        return v
    if isinstance(v, Pair):
        return {"kind": "pair", "key": to_json(v.key), "value": to_json(v.value)}
    if isinstance(v, Distribution):
        return {"kind": "distribution", "items": [{"label": label, "p": p} for label, p in v.items]}
    raise ReturnError(
        f"compute returned {_describe(v)}; a variable holds a string, an int, a position ID or a key : value pair."
    )


def type_problem(v: Any, t: dict | None) -> str | None:
    """Why `v` isn't a value of type `t`, or None. ∅ (None) fits every type."""
    if v is None or not t:
        return None
    kind = t.get("kind")
    if kind == "string":
        if isinstance(v, (str, Distribution)):
            return None
        return f"compute returned {show(v)!r} ({_describe(v)}), but this variable is a string."
    if kind in ("int", "position"):
        if isinstance(v, int) and not isinstance(v, bool):
            return None
        label = "a position ID" if kind == "position" else "an int"
        return f"compute returned {show(v)!r} ({_describe(v)}), but this variable is {label}."
    if kind == "pair":
        if not isinstance(v, Pair):
            return f"compute returned {show(v)!r} ({_describe(v)}), but this variable is a key : value pair."
        return type_problem(v.key, t.get("key")) or type_problem(v.value, t.get("value"))
    return None


# ----------------------------------------------------------------- calls


def _error_line(exc: BaseException) -> str:
    """'Name: message (line n)', with n the last line of compute that ran."""
    line = None
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == FILENAME:
            line = frame.lineno
    text = f"{type(exc).__name__}: {exc}"
    return f"{text} (line {line})" if line else text


def call(source: str, args: dict[str, Any], template: list[str] | tuple[str, ...] = (), type_: dict | None = None) -> dict:
    """Run compute(**args) on JSON values. Returns {"ok": True, "value": json}
    or {"ok": False, "error": message}; never raises."""
    try:
        fn, params = load(source, template)
        kwargs = {name: from_json(v) for name, v in args.items()}
        if "template" in params and "template" not in kwargs:
            kwargs["template"] = tuple(template)
        value = fn(**kwargs)
        out = to_json(value)
        problem = type_problem(value, type_)
        if problem:
            return {"ok": False, "error": problem}
        return {"ok": True, "value": out}
    except (FunctionError, ReturnError) as exc:
        return {"ok": False, "error": str(exc)}
    except RecursionError:
        return {"ok": False, "error": "RecursionError: compute called itself too many times."}
    except Exception as exc:  # noqa: BLE001  (shown to the user in place)
        return {"ok": False, "error": _error_line(exc)}


def call_batch(requests_json: str) -> str:
    """Run several calls; the worker's entry point. Takes and returns JSON:
    [{"id", "source", "args", "template", "type"}] → [{"id", "ok", "value" | "error"}]."""
    out = []
    for req in json.loads(requests_json):
        result = call(req["source"], req.get("args") or {}, req.get("template") or (), req.get("type"))
        out.append({"id": req["id"], **result})
    return json.dumps(out, ensure_ascii=False)


def python_runtime_files() -> dict[str, str]:
    """Source of each module the worker needs, keyed by file name, with an empty
    package __init__ (the real one imports causalab)."""
    import inspect

    package = sys.modules["algorithm_hypothesis"]
    files = {"__init__.py": '"""Algorithm Hypothesis runtime for the browser (no causalab)."""\n'}
    for name in MODULES:
        module = __import__(f"{package.__name__}.{name}", fromlist=[name])
        files[f"{name}.py"] = inspect.getsource(module)
    return files
