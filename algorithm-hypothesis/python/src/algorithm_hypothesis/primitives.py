"""Built-in functions a variable can use, with typed, named arguments.

The editor shows each function's source exactly as written here, and turning a
primitive into a custom Python function starts from this source, so keep each
one short and readable. Code generation calls them with keyword arguments named
after their slots. They must stay pure: no I/O, randomness or global state.

The TypeScript engine in workbench (src/lib/algorithmHypothesis) implements the
same functions and stores these sources; the golden tests keep them in sync.
"""

from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Callable

from algorithm_hypothesis import vartypes as vt
from algorithm_hypothesis.values import Distribution, K, Pair, Position, T, Token, V, show

# ----------------------------------------------------------------- functions


def position_id(token: str, specials: list[str]) -> Pair[Position, str]:
    """The token's position ID, stored as position ID : token. Each distinct
    special token (such as a name) gets the next ID in order of first
    appearance, so a name mentioned again gets its first mention's ID.
    `specials` are the special tokens up to this one; a possessive ('s) is
    ignored when comparing them."""

    def name(t):
        return str(t).strip().split("'")[0]

    ids = {}
    for t in specials:
        if t is not None:
            ids.setdefault(name(t), len(ids) + 1)
    if token is None or name(token) not in ids:
        return None
    return Pair(ids[name(token)], token)


def copy(x: T) -> T:
    """The value, unchanged, in another cell. Copying a token carries the
    token itself."""
    return x


def pair(key: K, value: V) -> Pair[K, V]:
    """Bind a key to a value."""
    return Pair(key, value)


def retrieve(key: K, pairs: list[Pair[K, V]], *, match: str = "key") -> V | None:
    """The value of the first pair whose key equals `key`, the way attention
    matches a query against keys and reads the matching value. With
    match="value", the first value equal to `key`: dereferencing a pointer,
    which finds nothing if that value isn't in context."""
    for p in pairs:
        if key is None or not isinstance(p, Pair):
            continue
        if (p.key if match == "key" else p.value) == key:
            return p.value
    return None


def index(i: Position, values: list[V]) -> V | None:
    """The i-th value, counting from 1."""
    if isinstance(i, int) and 1 <= i <= len(values):
        return values[i - 1]
    return None


def key_of(pair: Pair[K, V]) -> K | None:
    """The key of a key : value pair, such as the position ID of 4:Tim."""
    return pair.key if isinstance(pair, Pair) else None


def value_of(pair: Pair[K, V]) -> V | None:
    """The value of a key : value pair, such as the token of 4:Tim."""
    return pair.value if isinstance(pair, Pair) else None


def mixture(answers: list[V], *, weights: str = "") -> Distribution:
    """A linear combination of the answers, such as one per mechanism: each
    answer gets its weight, and the weights of equal answers add up.
    `weights` lists one weight per answer, separated by commas; a missing
    weight is 1. The result is normalized to sum to 1."""
    w = [float(x) for x in weights.split(",") if x.strip()]
    w = (w + [1.0] * len(answers))[: len(answers)]
    total = sum(w) or 1.0
    p: dict[str, float] = {}
    for answer, weight in zip(answers, w):
        p[show(answer)] = p.get(show(answer), 0.0) + weight / total
    return Distribution(tuple(p.items()))


def constant(*, value: str = "", type: str = "string") -> str | int | None:
    """A fixed value."""
    if value == "":
        return None
    return value if type == "string" else int(value)


# ------------------------------------------------- helpers for generated code


def as_token(text, index):
    """Wrap a token's text, as carried through the residual stream, with its index."""
    return None if text is None else Token(text, index)


def render(tok):
    """raw_input for generated models: the prompt's tokens, space-separated."""
    return " ".join(str(t).strip() for t in tok)


def display(value):
    """raw_output for generated models: the output as shown in the grid."""
    return show(value)


# ------------------------------------------------------------------ registry


@dataclass(frozen=True)
class Slot:
    name: str
    type: dict  # a pattern; {"kind": "list", ...} means the slot takes a list

    @property
    def many(self) -> bool:
        return self.type["kind"] == "list"


@dataclass(frozen=True)
class Option:
    name: str
    default: Any
    choices: tuple | None = None


@dataclass(frozen=True)
class Primitive:
    name: str
    label: str
    slots: tuple[Slot, ...]
    returns: dict | None  # None: set by the "type" option (constant)
    options: tuple[Option, ...] = field(default_factory=tuple)
    fn: Callable[..., Any] | None = None
    # Slots and return type under other option values, if they differ.
    retype: Callable[[dict], tuple[tuple[Slot, ...], dict | None] | None] | None = None

    @property
    def source(self) -> str:
        return inspect.getsource(self.fn)

    def signature(self, options: dict) -> tuple[tuple[Slot, ...], dict | None]:
        """Slots and return type for these option values."""
        alt = self.retype(options) if self.retype else None
        return alt or (self.slots, self.returns)


_K, _V, _T = vt.var("K"), vt.var("V"), vt.var("T")


def _retrieve_by_value(options: dict):
    # Matching on values: the key is compared with each pair's value.
    if options.get("match", "key") == "value":
        return (Slot("key", _V), Slot("pairs", vt.list_of(vt.pair(_K, _V)))), _V
    return None


PRIMITIVES: dict[str, Primitive] = {
    p.name: p
    for p in [
        Primitive(
            "position_id",
            "Position ID",
            (Slot("token", vt.STRING), Slot("specials", vt.list_of(vt.STRING))),
            vt.pair(vt.POSITION, vt.STRING),
            (),
            position_id,
        ),
        Primitive("copy", "Copy", (Slot("x", _T),), _T, (), copy),
        Primitive("pair", "Pair", (Slot("key", _K), Slot("value", _V)), vt.pair(_K, _V), (), pair),
        Primitive(
            "retrieve",
            "Retrieve",
            (Slot("key", _K), Slot("pairs", vt.list_of(vt.pair(_K, _V)))),
            _V,
            (Option("match", "key", ("key", "value")),),
            retrieve,
            _retrieve_by_value,
        ),
        Primitive("index", "Index", (Slot("i", vt.POSITION), Slot("values", vt.list_of(_V))), _V, (), index),
        Primitive("key_of", "KeyOf", (Slot("pair", vt.pair(_K, _V)),), _K, (), key_of),
        Primitive("value_of", "ValueOf", (Slot("pair", vt.pair(_K, _V)),), _V, (), value_of),
        Primitive("mixture", "Mixture", (Slot("answers", vt.list_of(_V)),), vt.STRING, (Option("weights", ""),), mixture),
        Primitive(
            "constant",
            "Constant",
            (),
            None,
            (Option("value", ""), Option("type", "string", ("string", "int", "position"))),
            constant,
        ),
    ]
}
