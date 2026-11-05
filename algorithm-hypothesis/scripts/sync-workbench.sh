#!/usr/bin/env bash
# Regenerate the golden files and copy them into workbench, which tests against
# them (golden.entity_binding.json) and ships the runtime to its Pyodide worker
# (pythonRuntime.json). Run from anywhere; needs uv and a causalab checkout
# (CAUSALAB_PATH, or causalab/ next to this repo).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
causalab="${CAUSALAB_PATH:-}"
for c in "$here/../causalab" "$here/../../causalab"; do
    [[ -z "$causalab" && -d "$c" ]] && causalab="$(cd "$c" && pwd)"
done
[[ -n "$causalab" ]] || { echo "causalab not found: set CAUSALAB_PATH" >&2; exit 1; }
cd "$here/python"
PYTHONPATH="src:$causalab" uv run --quiet python -m algorithm_hypothesis.golden
web="$here/../workbench/_web/src/lib/algorithmHypothesis"
cp "$here/golden/entity_binding.json" "$web/__tests__/golden.entity_binding.json"
cp "$here/golden/python_runtime.json" "$web/pythonRuntime.json"
echo "copied into $web"
