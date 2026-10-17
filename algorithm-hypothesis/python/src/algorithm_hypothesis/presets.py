"""The paper's algorithms as presets, placed on any entity-binding prompt.

Gur-Arieh, Geva & Geiger (2025), "Mixing Mechanisms": positional, lexical and
reflexive retrieval, plus Mixed, their union. Placement finds the template's
tokens by text ("{person} loves {food}, ... What does {query} love?"), so the
same preset works on abstract word tokens and on a model tokenizer's tokens.

The names are the algorithm's special tokens. Position ID numbers them in order
of first appearance and stores each as a position ID : name pair.

Positional: each name's position ID is copied onto its bound entity, which then
holds a position ID : entity pair. The recalled name gets its first mention's
position ID, and that position ID retrieves the bound entity.
Lexical: each entity is bound to its name (name : entity). The recalled name
itself retrieves the bound entity.
Reflexive: the same name : entity bindings, but the query token retrieves the
entity (a pointer to itself) early, and the last token dereferences it: it
retrieves by value, which finds nothing if the entity isn't in context.
Mixed: all three at once, each computing its own answer (pos_answer, lex_answer,
ref_answer; the positional bindings become pos_bind), combined linearly into
the answer at the last token.

Matches entityBindingExample() in workbench's TypeScript engine.
"""

from __future__ import annotations

from dataclasses import dataclass

from algorithm_hypothesis.schema import Algorithm, Arg, Function, Grid, Ref, Variable, infer_types

KINDS = ("positional", "lexical", "reflexive", "mixed")
NAMES = {"positional": "Positional", "lexical": "Lexical", "reflexive": "Reflexive", "mixed": "Mixed"}
DESCRIPTIONS = {
    "positional": "Each name's position ID is copied onto its bound entity; the recalled name's position ID retrieves it.",
    "lexical": "Each entity is bound to its name; the recalled name itself retrieves the bound entity.",
    "reflexive": "The query retrieves a pointer to the answer entity itself, which is dereferenced at the end. Fails if the entity isn't in context.",
    "mixed": "The union of the three algorithms: each computes its own answer, and the last token combines them linearly into a distribution over the entities.",
}

# Each example colors a variable by the one algorithm it serves; variables
# shared by several algorithms stay black.
ALGORITHM_COLORS = {"positional": "indigo", "lexical": "emerald", "reflexive": "amber"}


def _serves(var_id: str, kind: str) -> list[str]:
    """Which of the three algorithms a variable of an example serves. The
    positional example binds position IDs; the others bind names, which serve
    both lexical and reflexive retrieval. Mixed's answer combines all three."""
    if var_id.startswith(("pos", "id")) or var_id in ("q_pos", "P"):
        return ["positional"]
    if var_id.startswith("bind") and kind == "positional":
        return ["positional"]
    if var_id in ("q_key", "L", "lex_answer"):
        return ["lexical"]
    if var_id in ("q_ptr", "R", "ref_answer"):
        return ["reflexive"]
    if var_id.startswith("bind"):
        return ["lexical", "reflexive"]
    if var_id == "answer" and kind != "mixed":
        return [kind]
    return []


# Known layer placements: (names, bound entities, query token, last token, answer).
# 26 loosely follows the paper's gemma-2-2b-it findings (binding window 16–18).
_LAYERS = {8: (1, 2, 3, 5, 7), 26: (6, 8, 12, 16, 19)}


@dataclass(frozen=True)
class EntityBindingSlots:
    people: list[int]
    foods: list[int]
    query: int
    last: int


def _clean(t: str) -> str:
    return t.strip().lower()


def find_slots(tokens: list[str], delimiters: tuple[str, ...] = (",", ".", "and")) -> EntityBindingSlots:
    """Token indices of the people, foods, query and last token."""
    words = [_clean(t) for t in tokens]
    q_start = next((i for i, w in enumerate(words) if w in ("what", "who", "which")), None)
    if q_start is None:
        raise ValueError('Needs a question such as "What does Tim love?".')
    people, foods = [], []
    for j in range(1, q_start - 1):
        if words[j] != "loves":
            continue
        people.append(j - 1)
        k = j + 1
        while k + 1 < q_start and words[k + 1] not in delimiters and words[k + 1] != "loves":
            k += 1
        foods.append(k)
    if len(people) < 2:
        raise ValueError('Needs at least two "{person} loves {food}" clauses.')
    try:
        does = words.index("does", q_start)
        love = words.index("love", does)
    except ValueError as exc:
        raise ValueError('Needs a question of the form "What does {person} love?".') from exc
    if love - does < 2:
        raise ValueError("The question is missing the person.")
    return EntityBindingSlots(people, foods, love - 1, len(tokens) - 1)


def layer_plan(n_layers: int) -> tuple[int, int, int, int, int]:
    if n_layers in _LAYERS:
        return _LAYERS[n_layers]
    if n_layers < 6:
        raise ValueError("The examples need at least 6 layers.")
    top = n_layers - 1
    plan = [round(0.15 * top), round(0.3 * top), round(0.45 * top), round(0.62 * top)]
    for i in range(1, 4):
        plan[i] = max(plan[i], plan[i - 1] + 1)
    return plan[0], plan[1], plan[2], plan[3], min(top, plan[3] + 3)


def _var(id_, layer, token, fn, args, **options) -> Variable:
    """A primitive variable; args are (slot name, refs)."""
    function = Function("primitive", name=fn, options=options)
    return Variable(id_, id_, layer, token, function, [Arg(n, refs) for n, refs in args])


def _tok(i: int) -> Ref:
    return Ref(token=i)


def _v(id_: str) -> Ref:
    return Ref(variable=id_)


def entity_binding(
    kind: str,
    tokens: list[str],
    n_layers: int,
    *,
    template: str,
    grid: Grid | None = None,
) -> Algorithm:
    """One of the paper's algorithms placed on `tokens` with `n_layers` layers."""
    if kind not in KINDS:
        raise ValueError(f"Unknown example {kind!r}; choose from {KINDS}.")
    s = find_slots(tokens)
    names, bound, q, last, a = layer_plan(n_layers)
    n = len(s.foods)
    pos = [f"pos{k + 1}" for k in range(n)]
    ids = [f"id{k + 1}" for k in range(n)]
    bind = [f"bind{k + 1}" for k in range(n)]
    specials = [*s.people, s.query]
    vs: list[Variable] = []

    def position(id_: str, layer: int, token: int) -> Variable:
        # The special tokens up to this one: the names it numbers.
        return _var(id_, layer, token, "position_id", [("token", [_tok(token)]), ("specials", [_tok(i) for i in specials if i <= token])])

    # Each algorithm's answer. Mixed computes all three a layer early and
    # combines them where the others answer.
    if kind == "mixed" and a - 1 <= last:
        raise ValueError("The mixed example needs at least 7 layers.")
    at = a - 1 if kind == "mixed" else a

    def answer(prefix: str) -> str:
        return f"{prefix}_answer" if kind == "mixed" else "answer"

    if kind in ("positional", "mixed"):
        # Copying a position ID onto the entity takes one layer (KeyOf), binding it another.
        bound_at = max(bound, names + 2)
        pbind = bind if kind == "positional" else [f"pos_bind{k + 1}" for k in range(n)]
        vs += [position(pos[k], names, p) for k, p in enumerate(s.people)]
        vs += [_var(ids[k], names + 1, f, "key_of", [("pair", [_v(pos[k])])]) for k, f in enumerate(s.foods)]
        vs += [_var(pbind[k], bound_at, f, "pair", [("key", [_v(ids[k])]), ("value", [_tok(f)])]) for k, f in enumerate(s.foods)]
        vs.append(position("q_pos", q, s.query))
        vs.append(_var("P", last, s.last, "key_of", [("pair", [_v("q_pos")])]))
        vs.append(_var(answer("pos"), at, s.last, "retrieve", [("key", [_v("P")]), ("pairs", [_v(x) for x in pbind])], match="key"))
    if kind != "positional":
        vs += [_var(bind[k], bound, f, "pair", [("key", [_tok(s.people[k])]), ("value", [_tok(f)])]) for k, f in enumerate(s.foods)]
    if kind in ("lexical", "mixed"):
        vs.append(_var("q_key", q, s.query, "copy", [("x", [_tok(s.query)])]))
        vs.append(_var("L", last, s.last, "copy", [("x", [_v("q_key")])]))
        vs.append(_var(answer("lex"), at, s.last, "retrieve", [("key", [_v("L")]), ("pairs", [_v(x) for x in bind])], match="key"))
    if kind in ("reflexive", "mixed"):
        vs.append(_var("q_ptr", q, s.query, "retrieve", [("key", [_tok(s.query)]), ("pairs", [_v(x) for x in bind])], match="key"))
        vs.append(_var("R", last, s.last, "copy", [("x", [_v("q_ptr")])]))
        # Dereference: the bound entity equal to R, if there is one.
        vs.append(_var(answer("ref"), at, s.last, "retrieve", [("key", [_v("R")]), ("pairs", [_v(x) for x in bind])], match="value"))
    if kind == "mixed":
        answers = [_v(answer(p)) for p in ("pos", "lex", "ref")]
        vs.append(_var("answer", a, s.last, "mixture", [("answers", answers)], weights="1, 1, 1"))

    for v in vs:
        v.tags = _serves(v.id, kind)
        v.color = ALGORITHM_COLORS[v.tags[0]] if len(v.tags) == 1 else None

    output = "answer"
    if a < n_layers - 1:
        vs.append(_var("output", n_layers - 1, s.last, "copy", [("x", [_v("answer")])]))
        output = "output"

    alg = Algorithm(
        name=NAMES[kind],
        grid=grid or Grid("abstract", n_layers),
        template=template,
        variables=vs,
        output=output,
        description=DESCRIPTIONS[kind],
        special_tokens=specials,
    )
    types, _ = infer_types(alg)
    for v in alg.variables:
        v.type = types[v.id]
    return alg
