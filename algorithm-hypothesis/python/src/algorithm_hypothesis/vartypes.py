"""Variable types: string, int, position ID, and key : value pairs.

Types are JSON-shaped dicts, shared with workbench's TypeScript engine:

    {"kind": "string"} | {"kind": "int"} | {"kind": "position"}
    | {"kind": "pair", "key": <type>, "value": <type>}

Primitive signatures also use patterns: {"kind": "var", "name": "K"} for a
type variable and {"kind": "list", "of": <pattern>} for a list argument.
"""

from __future__ import annotations

from typing import Any

STRING = {"kind": "string"}
INT = {"kind": "int"}
POSITION = {"kind": "position"}
BASIC = ("string", "int", "position")

Type = dict[str, Any]


def pair(key: Type, value: Type) -> Type:
    return {"kind": "pair", "key": key, "value": value}


def list_of(of: Type) -> Type:
    return {"kind": "list", "of": of}


def var(name: str) -> Type:
    return {"kind": "var", "name": name}


def is_type(t: Any) -> bool:
    """Whether `t` is a concrete variable type (no patterns)."""
    if not isinstance(t, dict):
        return False
    if t.get("kind") in BASIC:
        return True
    return t.get("kind") == "pair" and is_type(t.get("key")) and is_type(t.get("value"))


def describe(t: Type | None, subst: dict[str, Type] | None = None) -> str:
    """Readable name: "position", "list of string", "position : string"."""
    if t is None:
        return "unknown"
    kind = t["kind"]
    if kind == "var":
        bound = (subst or {}).get(t["name"])
        return describe(bound) if bound else f"any type ({t['name']})"
    if kind == "list":
        return f"list of {describe(t['of'], subst)}"
    if kind == "pair":

        def side(x: Type) -> str:
            s = describe(x, subst)
            return f"({s})" if x.get("kind") == "pair" else s

        return f"{side(t['key'])} : {side(t['value'])}"
    return kind


def unify(pattern: Type, t: Type, subst: dict[str, Type]) -> bool:
    """Match a concrete type against a pattern, binding type variables."""
    kind = pattern["kind"]
    if kind == "var":
        bound = subst.get(pattern["name"])
        if bound is None:
            subst[pattern["name"]] = t
            return True
        return bound == t
    if kind == "pair":
        return t.get("kind") == "pair" and unify(pattern["key"], t["key"], subst) and unify(pattern["value"], t["value"], subst)
    return t.get("kind") == kind


def substitute(pattern: Type, subst: dict[str, Type]) -> Type | None:
    """The concrete type a pattern stands for, or None if a variable is unbound."""
    kind = pattern["kind"]
    if kind == "var":
        return subst.get(pattern["name"])
    if kind == "pair":
        k = substitute(pattern["key"], subst)
        v = substitute(pattern["value"], subst)
        return pair(k, v) if k is not None and v is not None else None
    if kind == "list":
        of = substitute(pattern["of"], subst)
        return list_of(of) if of is not None else None
    return dict(pattern)
