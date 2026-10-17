/**
 * Python source of each primitive, shown in the variable panel and used as the
 * starting point when a primitive is turned into a custom Python function.
 *
 * Copied verbatim from algorithm_hypothesis/primitives.py (via the golden file);
 * the golden test fails if they drift apart.
 */

import type { PrimitiveName } from "@/types/algorithmHypothesis";

export const PRIMITIVE_SOURCES: Record<PrimitiveName, string> = {
    position_id:
        'def position_id(token: str, specials: list[str]) -> Pair[Position, str]:\n    """The token\'s position ID, stored as position ID : token. Each distinct\n    special token (such as a name) gets the next ID in order of first\n    appearance, so a name mentioned again gets its first mention\'s ID.\n    `specials` are the special tokens up to this one; a possessive (\'s) is\n    ignored when comparing them."""\n\n    def name(t):\n        return str(t).strip().split("\'")[0]\n\n    ids = {}\n    for t in specials:\n        if t is not None:\n            ids.setdefault(name(t), len(ids) + 1)\n    if token is None or name(token) not in ids:\n        return None\n    return Pair(ids[name(token)], token)\n',
    copy: 'def copy(x: T) -> T:\n    """The value, unchanged, in another cell. Copying a token carries the\n    token itself."""\n    return x\n',
    pair: 'def pair(key: K, value: V) -> Pair[K, V]:\n    """Bind a key to a value."""\n    return Pair(key, value)\n',
    retrieve:
        'def retrieve(key: K, pairs: list[Pair[K, V]], *, match: str = "key") -> V | None:\n    """The value of the first pair whose key equals `key`, the way attention\n    matches a query against keys and reads the matching value. With\n    match="value", the first value equal to `key`: dereferencing a pointer,\n    which finds nothing if that value isn\'t in context."""\n    for p in pairs:\n        if key is None or not isinstance(p, Pair):\n            continue\n        if (p.key if match == "key" else p.value) == key:\n            return p.value\n    return None\n',
    index: 'def index(i: Position, values: list[V]) -> V | None:\n    """The i-th value, counting from 1."""\n    if isinstance(i, int) and 1 <= i <= len(values):\n        return values[i - 1]\n    return None\n',
    key_of: 'def key_of(pair: Pair[K, V]) -> K | None:\n    """The key of a key : value pair, such as the position ID of 4:Tim."""\n    return pair.key if isinstance(pair, Pair) else None\n',
    value_of:
        'def value_of(pair: Pair[K, V]) -> V | None:\n    """The value of a key : value pair, such as the token of 4:Tim."""\n    return pair.value if isinstance(pair, Pair) else None\n',
    mixture:
        'def mixture(answers: list[V], *, weights: str = "") -> Distribution:\n    """A linear combination of the answers, such as one per mechanism: each\n    answer gets its weight, and the weights of equal answers add up.\n    `weights` lists one weight per answer, separated by commas; a missing\n    weight is 1. The result is normalized to sum to 1."""\n    w = [float(x) for x in weights.split(",") if x.strip()]\n    w = (w + [1.0] * len(answers))[: len(answers)]\n    total = sum(w) or 1.0\n    p: dict[str, float] = {}\n    for answer, weight in zip(answers, w):\n        p[show(answer)] = p.get(show(answer), 0.0) + weight / total\n    return Distribution(tuple(p.items()))\n',
    constant:
        'def constant(*, value: str = "", type: str = "string") -> str | int | None:\n    """A fixed value."""\n    if value == "":\n        return None\n    return value if type == "string" else int(value)\n',
};
