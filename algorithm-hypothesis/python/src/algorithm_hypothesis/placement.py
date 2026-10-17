"""Where values live on the grid: tokenization, positions and residual spans.

A value is born in its cell and carried up its token's column until just
below the last variable that reads it (its span). Tokens are born on the
embedding row (layer -1) and carried the same way.
"""

from __future__ import annotations

import re

from algorithm_hypothesis.schema import EMB, Algorithm

_WORDS = re.compile(r"[\w']+|[^\w\s]")


def tokenize_abstract(text: str) -> list[str]:
    """Tokenizer for abstract grids: words and punctuation marks.

    Matches tokenizeAbstract() in workbench's TypeScript engine.
    """
    return _WORDS.findall(text)


def readers(alg: Algorithm) -> dict[str, list[int]]:
    """Node key ("v:<id>" or "t:<index>") → layers of the variables that read it."""
    out: dict[str, list[int]] = {}
    for v in alg.variables:
        for r in v.refs():
            out.setdefault(r.key, []).append(v.layer)
    return out


def birth(alg: Algorithm, key: str) -> int:
    if key.startswith("t:"):
        return EMB
    return alg.by_id()[key[2:]].layer


def column(alg: Algorithm, key: str) -> int:
    if key.startswith("t:"):
        return int(key[2:])
    return alg.by_id()[key[2:]].token


def span_end(alg: Algorithm, key: str, rd: dict[str, list[int]] | None = None) -> int:
    """Highest layer at which the value still sits in the residual stream."""
    rd = readers(alg) if rd is None else rd
    b = birth(alg, key)
    layers = rd.get(key)
    if not layers:
        return b
    return max(b, max(layers) - 1)


def nodes_at(alg: Algorithm, layer: int, token: int) -> list[str]:
    """Keys of every value living in cell (layer, token): variables in
    definition order, then the token itself."""
    rd = readers(alg)
    out = []
    for v in alg.variables:
        key = f"v:{v.id}"
        if v.token == token and v.layer <= layer <= span_end(alg, key, rd):
            out.append(key)
    tk = f"t:{token}"
    if tk in rd and layer <= span_end(alg, tk, rd):
        out.append(tk)
    return out
