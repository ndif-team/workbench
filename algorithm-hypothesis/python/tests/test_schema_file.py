"""Saved algorithms conform to schema/algorithm-hypothesis.v4.json."""

import json
from pathlib import Path

import jsonschema

from algorithm_hypothesis import tokenize_abstract
from algorithm_hypothesis.golden import PROMPTS
from algorithm_hypothesis.presets import KINDS, entity_binding

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "schema" / "algorithm-hypothesis.v4.json").read_text())


def test_presets_match_the_json_schema():
    tokens = tokenize_abstract(PROMPTS["target"])
    for kind in KINDS:
        for layers in (8, 26):
            jsonschema.validate(entity_binding(kind, tokens, layers, template=PROMPTS["target"]).to_dict(), SCHEMA)


def test_color_tags_and_inputs_match_the_json_schema():
    tokens = tokenize_abstract(PROMPTS["target"])
    alg = entity_binding("mixed", tokens, 8, template=PROMPTS["target"])
    alg.inputs = [PROMPTS["source"]]
    alg.by_id()["answer"].color = "#123abc"
    jsonschema.validate(alg.to_dict(), SCHEMA)
