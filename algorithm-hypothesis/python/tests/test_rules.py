"""Schema round trip, validation rules, interventions and Python variables."""

import pytest

from algorithm_hypothesis import (
    Algorithm,
    describe_type,
    infer_types,
    AlgorithmError,
    Arg,
    Function,
    Grid,
    Ref,
    Variable,
    compile_algorithm,
    problems,
    show,
    tokenize_abstract,
)
from algorithm_hypothesis.golden import PROMPTS
from algorithm_hypothesis.presets import entity_binding

TARGET = tokenize_abstract(PROMPTS["target"])
SOURCE = tokenize_abstract(PROMPTS["source"])
LAST = len(TARGET) - 1


def var(id_, layer, token, fn, args, **options):
    return Variable(id_, id_, layer, token, Function("primitive", fn, options), [Arg(n, r) for n, r in args])


def alg(*variables, output="answer"):
    return Algorithm("Test", Grid("abstract", 8), PROMPTS["target"], list(variables), output)


def test_json_round_trip():
    a = entity_binding("mixed", TARGET, 8, template=PROMPTS["target"])
    assert Algorithm.from_dict(a.to_dict()).to_dict() == a.to_dict()


def test_valid_presets_have_no_problems():
    for kind in ("positional", "lexical", "reflexive", "mixed"):
        assert problems(entity_binding(kind, TARGET, 8, template=PROMPTS["target"]), len(TARGET)) == []


def test_arguments_must_come_from_lower_layers_and_earlier_tokens():
    a = alg(
        var("x", 3, 5, "identity", [("token", [Ref(token=9)])]),  # token to the right
        var("y", 3, 9, "copy", [("x", [Ref(variable="x")])]),  # same layer
        var("answer", 7, LAST, "copy", [("x", [Ref(variable="y")])]),
    )
    msgs = "\n".join(problems(a, len(TARGET)))
    assert "causal mask" in msgs
    assert "must come from a lower layer" in msgs


def test_output_must_sit_at_last_layer_and_token():
    a = alg(var("answer", 6, 3, "identity", [("token", [Ref(token=2)])]))
    msgs = "\n".join(problems(a, len(TARGET)))
    assert "last layer" in msgs and "last token" in msgs


def test_slots_are_checked():
    a = alg(var("answer", 7, LAST, "retrieve", [("key", [Ref(token=1)]), ("pairs", [])]))
    assert any("add at least one reference to pairs" in m for m in problems(a, len(TARGET)))
    b = alg(var("answer", 7, LAST, "copy", []))
    assert any("exactly one reference" in m for m in problems(b, len(TARGET)))


def test_types_are_inferred_and_checked():
    a = entity_binding("positional", TARGET, 8, template=PROMPTS["target"])
    types, type_problems = infer_types(a)
    assert describe_type(types["pos1"]) == "position : string"
    assert describe_type(types["id1"]) == "position"
    assert describe_type(types["bind1"]) == "position : string"
    assert describe_type(types["q_pos"]) == "position : string"
    assert describe_type(types["P"]) == "position"
    assert describe_type(types["answer"]) == "string"
    assert type_problems == {}
    # A position can't key a retrieval over name : entity pairs.
    lex = entity_binding("lexical", TARGET, 8, template=PROMPTS["target"])
    pos = var("pos", 1, 0, "position_id", [("token", [Ref(token=0)]), ("specials", [Ref(token=0)])])
    pid = var("pid", 2, 0, "key_of", [("pair", [Ref(variable="pos")])])
    bad = var("answer", 7, LAST, "retrieve", [("key", [Ref(variable="pid")]), ("pairs", [Ref(variable="bind1")])])
    lex.variables = [v for v in lex.variables if v.id != "answer"] + [pos, pid, bad]
    msgs = "\n".join(problems(lex, len(TARGET)))
    assert "pairs: bind1 is string : string, but this argument needs position : any type (V)." in msgs


def test_nested_pairs():
    inner = var("inner", 1, 2, "pair", [("key", [Ref(token=0)]), ("value", [Ref(token=2)])])
    outer = var("outer", 2, 3, "pair", [("key", [Ref(variable="inner")]), ("value", [Ref(token=3)])])
    answer = var("answer", 7, LAST, "copy", [("x", [Ref(variable="outer")])])
    a = alg(inner, outer, answer)
    types, _ = infer_types(a)
    assert describe_type(types["outer"]) == "(string : string) : string"
    c = compile_algorithm(a, TARGET)
    assert show(c.output(c.run(TARGET))) == "(Ann:ale):,"


def test_names_are_python_identifiers():
    a = alg(var("tok", 7, LAST, "copy", [("x", [Ref(token=0)])]), output="tok")
    assert any("reserved" in m for m in problems(a, len(TARGET)))
    b = alg(var("a__L3", 7, LAST, "copy", [("x", [Ref(token=0)])]), output="a__L3")
    assert any("not a valid name" in m for m in problems(b, len(TARGET)))


def test_compile_reports_every_problem():
    with pytest.raises(AlgorithmError, match="No output variable"):
        compile_algorithm(alg(output=None), TARGET)


def test_interventions_only_swap_variables_with_the_same_name():
    c = compile_algorithm(entity_binding("positional", TARGET, 8, template=PROMPTS["target"]), TARGET)
    # P lives at L5 and L6 of the last token, so these two cells share it.
    r = c.interchange_intervention(SOURCE, TARGET, (5, LAST), (6, LAST))
    assert r.ok and r.swapped == ["v:P"] and show(r.output) == "jam"
    # q_group (query token) and P (last token) have different names.
    r = c.interchange_intervention(SOURCE, TARGET, (3, 18), (5, LAST))
    assert not r.ok and "same name" in r.reason and show(r.output) == "tea"
    r = c.interchange_intervention(SOURCE, TARGET, (0, LAST), (0, LAST))
    assert not r.ok and r.empty


def test_python_variables_run():
    upper = Variable(
        "upper",
        "upper",
        0,
        2,
        Function("python", source="def compute(word: str) -> str:\n    return str(word).upper()\n"),
        [Arg("word", [Ref(token=2)])],
        type={"kind": "string"},
    )
    shout = Variable(
        "answer",
        "answer",
        7,
        LAST,
        Function("python", source="def compute(a, b):\n    return f'{a}!{b}'\n"),
        [Arg("a", [Ref(variable="upper")]), Arg("b", [Ref(token=6)])],
        type={"kind": "string"},
    )
    c = compile_algorithm(alg(upper, shout), TARGET)
    assert c.output(c.run(TARGET)) == "ALE!jam"
    # Intervening on token 6 at the embedding layer swaps "jam" for "pie".
    assert (TARGET[6], SOURCE[6]) == ("jam", "pie")
    r = c.interchange_intervention(SOURCE, TARGET, (-1, 6), (-1, 6))
    assert r.ok and r.output == "ALE!pie"


def test_primitive_source_runs_as_a_python_function():
    """Turning a primitive into a Python function starts from its own source."""
    from algorithm_hypothesis.primitives import PRIMITIVES

    a = entity_binding("positional", TARGET, 8, template=PROMPTS["target"])
    for v in a.variables:
        if v.id == "pos2":
            v.function = Function("python", source=PRIMITIVES["position_id"].source.replace("def position_id(", "def compute("))
    c = compile_algorithm(a, TARGET)
    r = c.interchange_intervention(SOURCE, TARGET, (5, LAST), (5, LAST))
    assert show(r.output) == "jam"
    assert show(c.value_at(c.run(TARGET), "v:pos2", 1)) == "2:Joe"


def test_python_functions_need_a_type():
    f = Variable("answer", "answer", 7, LAST, Function("python", source="def compute():\n    return 1\n"), [])
    assert any("type this function returns" in m for m in problems(alg(f), len(TARGET)))


def test_generated_source_uses_relays():
    c = compile_algorithm(entity_binding("positional", TARGET, 8, template=PROMPTS["target"]), TARGET)
    assert "P__L6 = V(P, domain=ANY)" in c.source
    assert "retrieve(key=P__L6" in c.source
    assert "_p.position_id(token=_p.as_token(tok18__L2, 18), specials=[" in c.source


def test_position_ids_number_the_special_tokens():
    """Each distinct name gets the next ID in order of first appearance; a
    repeated name gets its first mention's ID, stored as ID : token."""
    from algorithm_hypothesis.primitives import position_id
    from algorithm_hypothesis.values import Token

    names = [Token(t, i) for i, t in enumerate(["Joe", "Ann", "Pete", "Tim", "Ann's"])]
    assert show(position_id(names[1], names[:2])) == "2:Ann"
    assert show(position_id(names[4], names)) == "2:Ann's"  # the possessive is ignored
    assert position_id(Token("ale", 9), names) is None  # not a special token
    a = entity_binding("positional", TARGET, 8, template=PROMPTS["target"])
    assert a.special_tokens == [0, 4, 8, 12, 18]
    c = compile_algorithm(a, TARGET)
    assert show(c.value_at(c.run(TARGET), "v:q_pos", 3)) == "4:Tim"
    assert show(c.value_at(c.run(SOURCE), "v:q_pos", 3)) == "2:Ann"
    assert show(c.value_at(c.run(TARGET), "v:bind2", 3)) == "2:jam"


def test_retrieve_by_value_dereferences():
    """Reflexive: the pointer is found among the bound entities, or not at all."""
    cod = tokenize_abstract(PROMPTS["source_cod"])
    c = compile_algorithm(entity_binding("reflexive", TARGET, 8, template=PROMPTS["target"]), TARGET)
    assert show(c.interchange_intervention(SOURCE, TARGET, (5, LAST), (5, LAST)).output) == "pie"
    assert show(c.interchange_intervention(cod, TARGET, (5, LAST), (5, LAST)).output) == "∅"
    types, _ = infer_types(c.algorithm)
    assert describe_type(types["answer"]) == "string"


def test_v3_reads_unless_it_uses_the_old_mixture():
    lexical = entity_binding("lexical", TARGET, 8, template=PROMPTS["target"]).to_dict()
    assert Algorithm.from_dict({**lexical, "schema": "algorithm-hypothesis/v3"}).to_dict() == lexical
    mixed = entity_binding("mixed", TARGET, 8, template=PROMPTS["target"]).to_dict()
    with pytest.raises(ValueError, match="Export the algorithm"):
        Algorithm.from_dict({**mixed, "schema": "algorithm-hypothesis/v3"})
