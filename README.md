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

There is a second `.env` file inside `workbench/workbench/_api/.env` that needs to be created.
Inside it, make sure you've set up:
- `NDIF_API_KEY` which you can get at [https://ndif.us/](https://ndif.us/)
- `WORKBENCH_DIR` pointing to the project location
- `HF_TOKEN` for accessing HuggingFace gated models

You'll also need to set up the root `.env` file. Clone the `.env.template` to the project root to get started.

Now, run the frontend and backend together, with:
1. bash ./scripts/web.sh
1. bash ./scripts/api.sh
