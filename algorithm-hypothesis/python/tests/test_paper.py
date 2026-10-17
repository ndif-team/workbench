"""The paper's predictions (Gur-Arieh et al. 2025, Figure 1 and §3.4)."""

import pytest

from algorithm_hypothesis import compile_algorithm, show, tokenize_abstract
from algorithm_hypothesis.golden import PROMPTS
from algorithm_hypothesis.presets import entity_binding

TARGET = tokenize_abstract(PROMPTS["target"])
SOURCE = tokenize_abstract(PROMPTS["source"])
SOURCE_COD = tokenize_abstract(PROMPTS["source_cod"])
LAST = len(TARGET) - 1
QUERY = 18  # "Tim" in the question


def compiled(kind, layers=8):
    return compile_algorithm(entity_binding(kind, TARGET, layers, template=PROMPTS["target"]), TARGET)


def sweep(kind, source, token, layers=8):
    rows = compiled(kind, layers).token_sweep(source, TARGET, token, token)
    return {r.layer: show(r.output) for r in rows}


@pytest.mark.parametrize("kind", ["positional", "lexical", "reflexive", "mixed"])
def test_target_answers_tea(kind):
    c = compiled(kind)
    assert show(c.output(c.run(TARGET))) == "tea"


@pytest.mark.parametrize(
    "kind, window",
    [("positional", "jam"), ("lexical", "ale"), ("reflexive", "pie")],
)
def test_last_token_binding_window(kind, window):
    out = sweep(kind, SOURCE, LAST)
    assert [out[layer] for layer in range(-1, 5)] == ["tea"] * 6  # nothing lives there yet
    assert out[5] == out[6] == window  # P / L / R carried from L5 to L6
    assert out[7] == "pie"  # the answer itself: the source's answer


@pytest.mark.parametrize("kind, window", [("positional", "jam"), ("lexical", "ale"), ("reflexive", "∅")])
def test_reflexive_pointer_cannot_be_dereferenced(kind, window):
    out = sweep(kind, SOURCE_COD, LAST)
    assert out[5] == window
    assert out[7] == "cod"


@pytest.mark.parametrize("kind, retrieved", [("positional", "jam"), ("lexical", "ale"), ("reflexive", "pie")])
def test_query_token_sweep(kind, retrieved):
    out = sweep(kind, SOURCE, QUERY)
    # Embedding layer to L2: the token itself is swapped, so the question is about Ann.
    assert [out[layer] for layer in range(-1, 3)] == ["ale"] * 4
    # L3 to L4: what the query token already retrieved is swapped.
    assert out[3] == out[4] == retrieved
    assert [out[layer] for layer in range(5, 8)] == ["tea"] * 3


def test_gemma_shaped_grid():
    out = sweep("positional", SOURCE, LAST, layers=26)
    assert all(out[layer] == "tea" for layer in range(-1, 16))
    assert out[16] == out[17] == out[18] == "jam"  # the paper's binding window
    assert all(out[layer] == "pie" for layer in range(19, 26))  # answer, then output


def test_mixed_is_the_union_of_the_three():
    """Mixed holds every variable of the three algorithms, unchanged except for
    names that would clash, and their answers one layer below the combination."""
    mixed = {v["id"]: v for v in entity_binding("mixed", TARGET, 8, template=PROMPTS["target"]).to_dict()["variables"]}
    seen = set()
    for kind, prefix in (("positional", "pos"), ("lexical", "lex"), ("reflexive", "ref")):
        rename = {"answer": f"{prefix}_answer"}
        if kind == "positional":
            rename |= {f"bind{k}": f"pos_bind{k}" for k in range(1, 5)}

        def ref(r):
            return {"variable": rename.get(r["variable"], r["variable"])} if "variable" in r else r

        for v in entity_binding(kind, TARGET, 8, template=PROMPTS["target"]).to_dict()["variables"]:
            name = rename.get(v["id"], v["id"])
            v = {**v, "id": name, "name": name, "args": [{**a, "refs": [ref(r) for r in a["refs"]]} for a in v["args"]]}
            if name == rename["answer"]:
                v["cell"] = {**v["cell"], "layer": 6}
            assert mixed[name] == v
            seen.add(name)
    assert set(mixed) - seen == {"answer"}
    assert mixed["answer"]["function"] == {"kind": "primitive", "name": "mixture", "options": {"weights": "1, 1, 1"}}


def test_mixed_combines_the_three_answers():
    out = sweep("mixed", SOURCE, LAST)
    assert [out[layer] for layer in range(-1, 5)] == ["tea"] * 6
    assert out[5] == "jam / ale / pie"  # P, L and R swapped: one answer each, equal weights
    assert out[6] == out[7] == "pie"  # the three answers, then their combination
    r = compiled("mixed").interchange_intervention(SOURCE, TARGET, (5, LAST), (5, LAST))
    assert {label: round(p, 3) for label, p in r.output.items} == {"jam": 0.333, "ale": 0.333, "pie": 0.333}
    assert sweep("mixed", SOURCE_COD, LAST)[5] == "jam / ale / ∅"  # the pointer finds nothing
