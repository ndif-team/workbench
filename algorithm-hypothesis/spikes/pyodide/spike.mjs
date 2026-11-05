// P1 spike: can causalab + algorithm_hypothesis run inside Pyodide, and how fast?
// Loads only causalab/causal (standard library) and this project's package
// into Pyodide's virtual filesystem, compiles the positional preset to a
// causalab CausalModel, checks it against the golden file, and times
// interchange interventions. Run: npm install && npm run spike
import { loadPyodide } from "pyodide";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(here, "../..");
// causalab checked out next to this project, or next to the repo holding it.
const causalab =
  process.env.CAUSALAB_PATH ||
  [path.resolve(project, "../causalab"), path.resolve(project, "../../causalab")].find((p) => fs.existsSync(p));

function copyTree(py, from, to) {
  py.FS.mkdirTree(to);
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    if (fs.statSync(src).isDirectory()) continue;
    if (!name.endsWith(".py")) continue;
    py.FS.writeFile(path.posix.join(to, name), fs.readFileSync(src, "utf8"));
  }
}

const t0 = performance.now();
const py = await loadPyodide();
const tLoad = performance.now();

py.FS.mkdirTree("/lib/causalab");
py.FS.writeFile("/lib/causalab/__init__.py", "");
copyTree(py, path.join(causalab, "causalab/causal"), "/lib/causalab/causal");
copyTree(py, path.join(project, "python/src/algorithm_hypothesis"), "/lib/algorithm_hypothesis");
py.FS.writeFile("/lib/golden.json", fs.readFileSync(path.join(project, "golden/entity_binding.json"), "utf8"));

let result;
try {
result = py.runPython(`
import sys, json, time
sys.path.insert(0, "/lib")
t = time.perf_counter()
from algorithm_hypothesis import compile_algorithm, show
from algorithm_hypothesis.golden import PROMPTS
from algorithm_hypothesis.placement import tokenize_abstract
t_import = time.perf_counter() - t

golden = json.load(open("/lib/golden.json"))
target = tokenize_abstract(PROMPTS["target"])
source = tokenize_abstract(PROMPTS["source"])

t = time.perf_counter()
compiled = {name: compile_algorithm(alg, target) for name, alg in golden["algorithms"].items()}
t_compile = (time.perf_counter() - t) / len(compiled)

mismatches = 0
for entry in golden["full"]:
    c = compiled[entry["algorithm"]]
    toks = tokenize_abstract(PROMPTS[entry["source"]])
    got = [[show(r.output) for r in col] for col in c.full_sweep(toks, target)]
    mismatches += sum(a != b for ga, gb in zip(got, entry["outputs"]) for a, b in zip(ga, gb))

c = compiled["positional_8"]
last = len(target) - 1
t = time.perf_counter()
for i in range(1000):
    layer = 5 + (i % 3)
    c.interchange_intervention(source, target, (layer, last), (layer, last))
t_1000 = time.perf_counter() - t
json.dumps({"python": sys.version.split()[0], "import_s": t_import, "compile_s": t_compile,
            "golden_mismatches": mismatches, "interventions_1000_s": t_1000})
`);
} catch (e) {
  console.error(String(e.message || e).split("\n").slice(-25).join("\n"));
  process.exit(1);
}
// The browser's path: a fresh interpreter with only the runtime bundle (no
// causalab), running the golden Python calls as workbench's worker does.
const golden = JSON.parse(fs.readFileSync(path.join(project, "golden/entity_binding.json"), "utf8"));
const bundle = JSON.parse(fs.readFileSync(path.join(project, "golden/python_runtime.json"), "utf8"));
const rt = await loadPyodide();
for (const [name, source] of Object.entries(bundle.files))
  rt.FS.mkdirTree(`/rt/${bundle.package}`), rt.FS.writeFile(`/rt/${bundle.package}/${name}`, source);
rt.runPython("import sys; sys.path.insert(0, '/rt')");
const callBatch = rt.runPython("from algorithm_hypothesis.runtime import call_batch; call_batch");
const requests = golden.python_calls.map((c, i) => ({ id: i, source: c.source, args: c.args, template: golden.tokens.target, type: c.type }));
const answers = JSON.parse(callBatch(JSON.stringify(requests)));
// Error text can differ between CPython versions; compare the exception name.
const same = (a, b) =>
  a.ok === b.ok && (a.ok ? JSON.stringify(a.value) === JSON.stringify(b.value) : a.error.split(":")[0] === b.error.split(":")[0]);
const runtimeMismatches = answers.filter((a, i) => !same(a, golden.python_calls[i].result)).length;

const tEnd = performance.now();
const r = { ...JSON.parse(result), runtime_calls: answers.length, runtime_mismatches: runtimeMismatches };
console.log(JSON.stringify({ pyodide_load_s: (tLoad - t0) / 1000, ...r, total_s: (tEnd - t0) / 1000 }, null, 2));
