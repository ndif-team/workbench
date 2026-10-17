# Algorithm Hypothesis

Draw a hypothesized algorithm on a transformer's layers × tokens grid, then run
interchange interventions on it. The editor is part of workbench (this repo,
branch `feat/algorithm-hypothesis`, under `workbench/_web`); this folder holds
everything else.

| Path | What it is |
| --- | --- |
| `design/` | The design doc and its live mockups (published as an artifact). |
| `schema/algorithm-hypothesis.v4.json` | JSON Schema for saved algorithms, shared by workbench and Python. v4: Mixture is a linear combination of answers; v3 brought the current primitives, special tokens, saved inputs, and per-variable color and tags. |
| `python/` | The `algorithm_hypothesis` package: schema, primitives, compilation to causalab, interventions. |
| `golden/entity_binding.json` | The paper's algorithms, their sweeps, and golden calls of custom Python functions. Both test suites check against it. |
| `golden/python_runtime.json` | The modules workbench's Pyodide worker loads to run custom Python functions (`values`, `vartypes`, `primitives`, `runtime`; no causalab). |
| `spikes/pyodide/` | P1 spike: the package and `causalab.causal` running inside Pyodide, plus the runtime bundle's golden calls. |

## Python package

Uses only `causalab.causal`, which needs nothing outside the standard library,
so causalab isn't a declared dependency. Clone
[causalab](https://github.com/goodfire-ai/causalab) next to this repo (or point
`CAUSALAB_PATH` at a checkout):

```bash
git clone https://github.com/goodfire-ai/causalab ../causalab   # from the repo root
cd algorithm-hypothesis/python
export PYTHONPATH=src:$(cd ../../../causalab && pwd)
uv run --group dev pytest                       # 44 tests
```

After changing the package, run `scripts/sync-workbench.sh`: it regenerates
`golden/*.json` and copies them into workbench
(`workbench/_web/src/lib/algorithmHypothesis/`), whose tests fail if the two
engines drift apart.

Custom Python functions run the same way in both places: `runtime.strip_function`
removes type hints and keeps line numbers, and the compiled causalab model and
the browser's worker (`runtime.call`) give a function the same names (`math`,
`Pair`, `Token`, `Distribution`, `show`, and `template` for a parameter of that
name).

```python
from algorithm_hypothesis import compile_algorithm, tokenize_abstract

compiled = compile_algorithm("positional.json")      # JSON exported from workbench
target = tokenize_abstract("Ann loves ale, Joe loves jam, Pete loves pie, Tim loves tea. What does Tim love?")
source = tokenize_abstract("Joe loves ale, Ann loves pie, Pete loves jam, Tim loves tea. What does Ann love?")
result = compiled.interchange_intervention(source, target, (5, 20), (5, 20))
result.output            # "jam": the counterfactual output
compiled.model           # the causalab CausalModel
print(compiled.source)   # the generated @mechanism
```

Primitives (`algorithm_hypothesis.primitives`): Position ID (numbers the
algorithm's special tokens, such as names, in order of first appearance and
returns a position ID : token pair), Copy, Pair, Retrieve (by key, or by value
to dereference), Index, KeyOf, ValueOf, Mixture and Constant. Anything else is a
custom Python function.

Each layer a value is carried through becomes a relay node (`P__L6 = V(P)`), and
each variable reads the node one layer below itself. An interchange
intervention on cell (layer, token) is then an ordinary causalab intervention
on the nodes at that layer. Only variables with the same name are swapped.

## Pyodide spike (P1)

`cd spikes/pyodide && npm install && npm run spike` loads Pyodide in Node, copies
`causalab/causal` and the package into its filesystem, compiles all five golden
algorithms, reruns every full sweep and times interventions. It then starts a
second interpreter with only `golden/python_runtime.json` (what workbench's
worker loads) and runs the golden Python calls. Runs on 2–3 Oct 2026 (WSL2,
Node 20, Pyodide 0.27.7 / Python 3.12.7):

| Step | Time |
| --- | --- |
| Load Pyodide (local files) | 1.6–4.3 s |
| Import causalab + package | 0.15–0.31 s |
| Compile one algorithm | 0.13–0.37 s |
| 1,000 interchange interventions | 0.33–1.5 s |
| Golden full sweeps, Pyodide vs CPython | 0 mismatches |
| Golden Python calls through the runtime bundle | 9 of 9 match |

Timings vary about threefold between runs on this machine, Pyodide's own load
included. Values (`Token`, `Pair`,
`Distribution`) are immutable and return themselves from `__deepcopy__`; without
that, causalab's trace copies cost 2–3 ms per intervention.

In a browser, add the download of Pyodide itself (about 10 MB, cached after the first visit).
