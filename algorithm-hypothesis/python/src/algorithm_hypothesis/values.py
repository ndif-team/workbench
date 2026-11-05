"""Values that flow through an algorithm: tokens, pairs, distributions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")
T = TypeVar("T")

# A position ID is an int; the alias documents intent in signatures.
Position = int


class Token(str):
    """A prompt token: a string (without surrounding spaces) that also knows
    its index in the prompt."""

    index: int
    raw: str

    def __new__(cls, text: str, index: int) -> "Token":
        obj = super().__new__(cls, str(text).strip())
        obj.index = index
        obj.raw = str(text)
        return obj

    def __reduce__(self):
        return (Token, (self.raw, self.index))

    # Values are immutable, so copies of a trace can share them. Without this,
    # deepcopy rebuilds every token through __reduce__ on each intervention.
    def __copy__(self) -> "Token":
        return self

    def __deepcopy__(self, memo: dict) -> "Token":
        return self


@dataclass(frozen=True)
class Pair(Generic[K, V]):
    """A key : value pair. Keys and values can themselves be pairs."""

    key: K
    value: V

    def __str__(self) -> str:
        def side(x: Any) -> str:
            return f"({show(x)})" if isinstance(x, Pair) else show(x)

        return f"{side(self.key)}:{side(self.value)}"

    def __copy__(self) -> "Pair[K, V]":
        return self

    def __deepcopy__(self, memo: dict) -> "Pair[K, V]":
        return self


@dataclass(frozen=True)
class Distribution:
    """A distribution over labels; visualizations show its top label."""

    items: tuple[tuple[str, float], ...]

    def top(self) -> tuple[str, float]:
        best = self.items[0]
        for item in self.items[1:]:
            if item[1] > best[1]:
                best = item
        return best

    def label(self) -> str:
        """The top label, or tied top labels joined with " / "."""
        best = self.top()[1]
        return " / ".join(label for label, p in self.items if best - p < 0.01)

    def __str__(self) -> str:
        return self.label()

    def __copy__(self) -> "Distribution":
        return self

    def __deepcopy__(self, memo: dict) -> "Distribution":
        return self


def key_of(value: Any) -> tuple | None:
    """Identity used for "did this value change" checks."""
    if value is None:
        return None
    if isinstance(value, str):
        return ("s", value.strip())
    if isinstance(value, Pair):
        return ("pair", key_of(value.key), key_of(value.value))
    if isinstance(value, Distribution):
        return ("d", tuple((label, round(p * 100)) for label, p in value.items))
    if isinstance(value, bool):
        return ("b", value)
    if isinstance(value, (int, float)):
        return ("n", value)
    return ("o", repr(value))


def show(value: Any) -> str:
    """How a value is displayed in a grid cell."""
    if value is None:
        return "∅"
    if isinstance(value, Distribution):
        return value.label()
    return str(value)
