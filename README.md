<p align="center">
  <img src="./workbench_logo.png" alt="Workbench" width="300">
</p>

<h3 align="center">
AI Interpretability Research Platform
</h3>

<h4 align="center">
<a href="https://workbench.ndif.us/">Use Workbench now!</a>
</h4>

<p align="center">
<a href="https://github.com/ndif-team/workbench"><b>GitHub</b></a> | <a href="https://discord.gg/6uFJmCSwW7"><b>Discord</b></a> | <a href="https://discuss.ndif.us/"><b>Forum</b></a> | <a href="https://x.com/ndif_team"><b>Twitter</b></a>
</p>

[![Covered by Argos Visual Testing](https://argos-ci.com/badge.svg)](https://app.argos-ci.com/jon-bell/workbench/reference?utm_source=ndif&utm_campaign=oss)


---

## About

**Workbench** is a UI for doing exploratory analysis on open source AI models by applying interpretability techniques. It leverages both [NNsight](https://github.com/ndif-team/nnsight) and [NDIF](https://github.com/ndif-team/ndif) to provide an interactive environment for exploring LLM internals and building experiments.

---

## Algorithm Hypothesis (this fork)

This fork adds **Algorithm Hypothesis**: draw a hypothesized algorithm on a model's layers × tokens
grid, then run interchange interventions on it and compare the counterfactual outputs that
different algorithms predict. The design doc, the `algorithm_hypothesis` Python package (which
compiles an algorithm to a [causalab](https://github.com/goodfire-ai/causalab) causal model) and
their tests live in [`algorithm-hypothesis/`](algorithm-hypothesis/).

The tool runs entirely in the frontend: it needs no Python backend, no model and no GPU.

### Run it locally

Requirements: Node.js 20 or newer (the SQLite driver's prebuilt binary needs it), [Bun](https://bun.sh/)
and git.

```bash
git clone -b feat/algorithm-hypothesis https://github.com/AmirZur/workbench.git
cd workbench
cat > .env <<'ENV'
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_DISABLE_AUTH=true
NEXT_PUBLIC_LOCAL_DB=true
LOCAL_SQLITE_URL=./local.db
ENV
cd workbench/_web
bun install
cp ../../.env .env && bunx drizzle-kit push   # creates the SQLite tables in workbench/_web/local.db
bun run dev                                    # http://localhost:3000
```

After pulling new commits, run `bunx drizzle-kit push` again in `workbench/_web` in case the
database schema changed (it only adds tables and columns).

Open the workspace, then choose **Algorithm Hypothesis** in the left sidebar. The header shows
the model backend as unavailable; Algorithm Hypothesis doesn't use it.

- **Walkthrough**, next to the mode tabs, builds the paper's positional, lexical and reflexive
  algorithms step by step and intervenes on them.
- **Sharing an algorithm:** *Download* (Algorithm panel, Export) writes it as a JSON file; in
  another copy, *Open*, *From file…* opens the file as a new algorithm. Save it there to compare it
  with the others in Intervene and Sweep.
- **Custom Python functions** run in the browser with Pyodide, downloaded once (about 10 MB) from
  cdn.jsdelivr.net. To host it yourself, set `NEXT_PUBLIC_PYODIDE_URL`.
- **gemma-2-2b-it grids** use only the model's tokenizer. Its official copy is gated, so without an
  `HF_TOKEN` the grid uses the ungated `unsloth/gemma-2-2b-it`, which serves the same tokenizer.
  Abstract grids need nothing.
- **Tests:** `bash ./scripts/test.sh` from the repo root runs the frontend suite, including the
  engine's golden tests. The Python package's tests are described in
  [`algorithm-hypothesis/README.md`](algorithm-hypothesis/README.md).

---

## Setup

### Requirements
1. [Node.js](https://nodejs.org/) >= 18.18.0
1. [Install uv](https://docs.astral.sh/uv/)
1. [Install bun](https://bun.sh/)

### Steps
1. Create a venv using `uv venv`
1. Activate it afterwards using the printed command
1. Run `uv sync --extra dev`
1. Setup `.env` and `workbench/_api/.env` following their respective `.env.template` files.

Now, run the frontend and backend together, with:
1. bash ./scripts/web.sh
1. bash ./scripts/api.sh

---

## Local Database

To use a local SQLite database instead of Supabase, add these to your root `.env`:

```env
NEXT_PUBLIC_LOCAL_DB=true
LOCAL_SQLITE_URL=./local.db
```

Then create the database tables:

```bash
cd workbench/_web
bunx drizzle-kit generate
bunx drizzle-kit push
```
