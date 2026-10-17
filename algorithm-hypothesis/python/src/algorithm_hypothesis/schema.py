"""Algorithm definitions (schema v4), type inference and validation rules.

An algorithm is a set of typed variables placed on a layers × tokens grid. The
same JSON is saved by workbench and read here; see
schema/algorithm-hypothesis.v4.json. Version 3 brought the current primitives
(Position ID returns a position ID : token pair), designated special tokens,
and per-variable color and tags; version 4 makes Mixture a linear combination
of answers instead of the paper's Eq. 2.

Rules (design doc §4.4):
  1. Arguments come from strictly lower layers.
  2. Arguments come from tokens at or before the variable's own token.
  3. The output sits at the last layer and the last token.
  4. Arguments match the types their function expects.
Rules 1 and 2 make the algorithm autoregressive and rule out cycles.
"""

from __future__ import annotations

import keyword
import re
from dataclasses import dataclass, field
from typing import Any

from algorithm_hypothesis import vartypes as vt
from algorithm_hypothesis.primitives import PRIMITIVES

SCHEMA_ID = "algorithm-hypothesis/v4"
# Version 3 differs only in Mixture, so a v3 algorithm without one reads as is.
_V3 = "algorithm-hypothesis/v3"
EMB = -1  # the embedding row, where tokens are born

RESERVED = {"tok", "raw_input", "raw_output", "render", "TEMPLATE"}
_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class Ref:
    """A reference to a token (by index) or to another variable (by id)."""

    token: int | None = None
    variable: str | None = None

    @property
    def key(self) -> str:
        return f"t:{self.token}" if self.variable is None else f"v:{self.variable}"

    def to_dict(self) -> dict:
        return {"variable": self.variable} if self.variable is not None else {"token": self.token}

    @staticmethod
    def from_dict(d: dict) -> "Ref":
        if "variable" in d:
            return Ref(variable=str(d["variable"]))
        return Ref(token=int(d["token"]))


@dataclass
class Arg:
    """A named argument slot holding one or more references."""

    name: str
    refs: list[Ref]

    def to_dict(self) -> dict:
        return {"name": self.name, "refs": [r.to_dict() for r in self.refs]}

    @staticmethod
    def from_dict(d: dict) -> "Arg":
        return Arg(str(d["name"]), [Ref.from_dict(r) for r in d.get("refs", [])])


@dataclass
class Function:
    kind: str  # "primitive" | "python"
    name: str | None = None  # primitive name
    options: dict[str, Any] = field(default_factory=dict)
    source: str | None = None  # python source defining `compute`

    def to_dict(self) -> dict:
        if self.kind == "python":
            return {"kind": "python", "source": self.source or ""}
        return {"kind": "primitive", "name": self.name, "options": dict(self.options)}

    @staticmethod
    def from_dict(d: dict) -> "Function":
        if d.get("kind") == "python":
            return Function("python", source=d.get("source", ""))
        return Function("primitive", name=d["name"], options=dict(d.get("options") or {}))


@dataclass
class Variable:
    id: str
    name: str
    layer: int
    token: int
    function: Function
    args: list[Arg]
    # Declared for Python functions; inferred (and stored for reference) for primitives.
    type: dict | None = None
    # Display only: a color (a palette name such as "indigo", or "#rrggbb") and
    # free-form tags, e.g. the algorithm a variable serves in a mixture.
    color: str | None = None
    tags: list[str] = field(default_factory=list)

    def refs(self) -> list[Ref]:
        return [r for a in self.args for r in a.refs]

    def to_dict(self) -> dict:
        d = {
            "id": self.id,
            "name": self.name,
            "cell": {"layer": self.layer, "token": self.token},
            "type": self.type,
            "function": self.function.to_dict(),
            "args": [a.to_dict() for a in self.args],
        }
        if self.color:
            d["color"] = self.color
        if self.tags:
            d["tags"] = list(self.tags)
        return d

    @staticmethod
    def from_dict(d: dict) -> "Variable":
        return Variable(
            id=str(d["id"]),
            name=str(d["name"]),
            layer=int(d["cell"]["layer"]),
            token=int(d["cell"]["token"]),
            function=Function.from_dict(d["function"]),
            args=[Arg.from_dict(a) for a in d.get("args", [])],
            type=d.get("type"),
            color=d.get("color") or None,
            tags=[str(t) for t in d.get("tags") or []],
        )


@dataclass
class Grid:
    kind: str  # "abstract" | "model"
    layers: int
    model: str | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {"kind": self.kind, "layers": self.layers}
        if self.model:
            d["model"] = self.model
        return d

    @staticmethod
    def from_dict(d: dict) -> "Grid":
        return Grid(str(d.get("kind", "abstract")), int(d["layers"]), d.get("model"))


@dataclass
class Algorithm:
    name: str
    grid: Grid
    template: str
    variables: list[Variable]
    output: str | None
    description: str = ""
    # Saved prompts to run the algorithm on, e.g. sources and targets for interventions.
    inputs: list[str] = field(default_factory=list)
    # Positions of designated special tokens, such as names, in the template.
    # Position ID reads them to number the entities.
    special_tokens: list[int] = field(default_factory=list)

    def by_id(self) -> dict[str, Variable]:
        return {v.id: v for v in self.variables}

    def to_dict(self) -> dict:
        d = {
            "schema": SCHEMA_ID,
            "name": self.name,
            "description": self.description,
            "grid": self.grid.to_dict(),
            "template": self.template,
            "variables": [v.to_dict() for v in self.variables],
            "output": self.output,
        }
        if self.inputs:
            d["inputs"] = list(self.inputs)
        if self.special_tokens:
            d["specialTokens"] = list(self.special_tokens)
        return d

    @staticmethod
    def from_dict(d: dict) -> "Algorithm":
        schema = d.get("schema", SCHEMA_ID)
        uses_mixture = any(v.get("function", {}).get("name") == "mixture" for v in d.get("variables", []))
        if schema != SCHEMA_ID and not (schema == _V3 and not uses_mixture):
            raise ValueError(f"Unsupported schema {schema!r}; expected {SCHEMA_ID!r}. Export the algorithm from the editor again.")
        return Algorithm(
            name=str(d.get("name", "Untitled")),
            grid=Grid.from_dict(d["grid"]),
            template=str(d.get("template", "")),
            variables=[Variable.from_dict(v) for v in d.get("variables", [])],
            output=d.get("output"),
            description=str(d.get("description", "")),
            inputs=[str(x) for x in d.get("inputs") or []],
            special_tokens=[int(x) for x in d.get("specialTokens") or []],
        )


# --------------------------------------------------------------------- types


def infer_types(alg: Algorithm) -> tuple[dict[str, dict | None], dict[str, list[str]]]:
    """Each variable's type, and type problems per variable.

    A primitive's type follows from its signature and its arguments' types; a
    Python function's type is the one declared on the variable.
    """
    vars_ = alg.by_id()
    types: dict[str, dict | None] = {}
    problems: dict[str, list[str]] = {}
    for v in sorted(alg.variables, key=lambda x: (x.layer, x.token)):
        if v.function.kind == "python":
            types[v.id] = v.type if vt.is_type(v.type) else None
            continue
        prim = PRIMITIVES.get(v.function.name or "")
        if prim is None:
            types[v.id] = None
            continue
        slots, returns = prim.signature(v.function.options)
        if returns is None:  # constant
            kind = str(v.function.options.get("type", "string"))
            types[v.id] = {"kind": kind} if kind in vt.BASIC else None
            continue
        subst: dict[str, dict] = {}
        errs: list[str] = []
        by_name = {a.name: a for a in v.args}
        for slot in slots:
            element = slot.type["of"] if slot.many else slot.type
            for r in by_name[slot.name].refs if slot.name in by_name else []:
                if r.variable is None:
                    rt, label = vt.STRING, f"token {r.token}"
                else:
                    rv = vars_.get(r.variable)
                    rt, label = types.get(r.variable), rv.name if rv else r.variable
                if rt is None:
                    continue
                expected = vt.describe(element, subst)
                if not vt.unify(element, rt, subst):
                    errs.append(f"{slot.name}: {label} is {vt.describe(rt)}, but this argument needs {expected}.")
        types[v.id] = vt.substitute(returns, subst)
        if errs:
            problems[v.id] = errs
    return types, problems


# ---------------------------------------------------------------- validation


def ref_problem(alg: Algorithm, host_layer: int, host_token: int, ref: Ref) -> str | None:
    """Why `ref` can't be an argument of a variable at (host_layer, host_token)."""
    if ref.variable is None:
        if ref.token is None or ref.token < 0:
            return "Unknown token."
        if ref.token > host_token:
            return "Tokens to the right are not visible yet (causal mask)."
        return None
    v = alg.by_id().get(ref.variable)
    if v is None:
        return f"Unknown variable {ref.variable!r}."
    if v.layer >= host_layer:
        return f"{v.name} is at L{v.layer}; arguments must come from a lower layer."
    if v.token > host_token:
        return f"{v.name} sits to the right of this cell (causal mask)."
    return None


def slot_problems(var: Variable) -> list[str]:
    """Whether the arguments fill the function's slots."""
    out = []
    if var.function.kind == "python":
        names = [a.name for a in var.args]
        for n in names:
            if not _IDENT.match(n) or keyword.iskeyword(n):
                out.append(f"Argument name {n!r} is not a valid Python identifier.")
        if len(set(names)) != len(names):
            out.append("Argument names must be unique.")
        if not vt.is_type(var.type):
            out.append("Choose the type this function returns.")
        return out
    prim = PRIMITIVES.get(var.function.name or "")
    if prim is None:
        return [f"Unknown primitive {var.function.name!r}."]
    by_name = {a.name: a for a in var.args}
    for slot in prim.slots:
        refs = by_name[slot.name].refs if slot.name in by_name else []
        if slot.many and not refs:
            out.append(f"{prim.label}: add at least one reference to {slot.name}.")
        if not slot.many and len(refs) != 1:
            out.append(f"{prim.label}: {slot.name} takes exactly one reference.")
    extra = set(by_name) - {s.name for s in prim.slots}
    if extra:
        out.append(f"{prim.label} has no argument named {sorted(extra)[0]!r}.")
    if prim.name == "constant" and str(var.function.options.get("type", "string")) != "string":
        try:
            int(str(var.function.options.get("value", "")) or "0")
        except ValueError:
            out.append("Constant: an int or position value must be a whole number.")
    return out


def problems(alg: Algorithm, n_tokens: int | None = None) -> list[str]:
    """Everything that stops the algorithm from running, as readable messages."""
    out: list[str] = []
    _, type_problems = infer_types(alg)
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for v in alg.variables:
        where = f"{v.name} (L{v.layer}, token {v.token})"
        if v.id in seen_ids:
            out.append(f"Duplicate variable id {v.id!r}.")
        seen_ids.add(v.id)
        if not _IDENT.match(v.name) or keyword.iskeyword(v.name) or "__" in v.name:
            out.append(f"{v.name!r} is not a valid name: use letters, digits and single underscores.")
        if v.name in RESERVED:
            out.append(f"{v.name!r} is reserved.")
        if v.name in seen_names:
            out.append(f"Two variables are called {v.name!r}.")
        seen_names.add(v.name)
        if not 0 <= v.layer < alg.grid.layers:
            out.append(f"{where} is outside the grid's {alg.grid.layers} layers.")
        if n_tokens is not None and not 0 <= v.token < n_tokens:
            out.append(f"{where} is outside the prompt's {n_tokens} tokens.")
        for r in v.refs():
            msg = ref_problem(alg, v.layer, v.token, r)
            if msg:
                out.append(f"{where}: {msg}")
        out.extend(f"{where}: {m}" for m in slot_problems(v))
        out.extend(f"{where}: {m}" for m in type_problems.get(v.id, []))
    out_var = alg.by_id().get(alg.output or "")
    if out_var is None:
        out.append("No output variable.")
    else:
        if out_var.layer != alg.grid.layers - 1:
            out.append(f"The output must sit at the last layer (L{alg.grid.layers - 1}).")
        if n_tokens is not None and out_var.token != n_tokens - 1:
            out.append(f"The output must sit at the last token ({n_tokens - 1}).")
    return out
