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

---

## About

**Workbench** is a UI for doing exploratory analysis on open source AI models by applying interpretability techniques. It leverages both [NNsight](https://github.com/ndif-team/nnsight) and [NDIF](https://github.com/ndif-team/ndif) to provide an interactive environment for exploring LLM internals and building experiments.

---

## Setup

### Requirements
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
