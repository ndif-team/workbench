"""Algorithm Hypothesis: algorithms placed on a transformer's layers × tokens grid.

Load an algorithm saved by workbench (schema v2), compile it to a causalab
CausalModel, and run interchange interventions on it:

    from algorithm_hypothesis import compile_algorithm, tokenize_abstract

    compiled = compile_algorithm("positional.json")
    target = tokenize_abstract("Ann loves ale, ... What does Tim love?")
    source = tokenize_abstract("Joe loves ale, ... What does Ann love?")
    result = compiled.interchange_intervention(source, target, (5, 20), (5, 20))
    result.output  # the counterfactual output
"""

from algorithm_hypothesis.compile import (
    AlgorithmError,
    CompiledAlgorithm,
    InterventionResult,
    SweepRow,
    compile_algorithm,
    generate_source,
)
from algorithm_hypothesis.placement import nodes_at, readers, span_end, tokenize_abstract
from algorithm_hypothesis.primitives import PRIMITIVES
from algorithm_hypothesis.schema import SCHEMA_ID, Algorithm, Arg, Function, Grid, Ref, Variable, infer_types, problems
from algorithm_hypothesis.values import Distribution, Pair, Token, key_of, show
from algorithm_hypothesis.vartypes import describe as describe_type

__all__ = [
    "PRIMITIVES",
    "SCHEMA_ID",
    "Algorithm",
    "AlgorithmError",
    "Arg",
    "CompiledAlgorithm",
    "Distribution",
    "Function",
    "Grid",
    "InterventionResult",
    "Pair",
    "Ref",
    "SweepRow",
    "Token",
    "Variable",
    "compile_algorithm",
    "describe_type",
    "infer_types",
    "generate_source",
    "key_of",
    "nodes_at",
    "problems",
    "readers",
    "show",
    "span_end",
    "tokenize_abstract",
]
