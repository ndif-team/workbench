# Workbench

## Setup

### Requirements
1. [Install uv](https://docs.astral.sh/uv/)
1. [Install bun](https://bun.sh/)

### Steps
1. Create a venv using `uv venv`
1. Activate it afterwards using the printed command
1. Run `uv sync --extra dev`
1. Change to `workbench/_web/`
1. Run `bun install`

There is a second `.env` file inside `workbench/workbench/_api/.env` that needs to be created.
Inside it, make sure you've set up:
- `NDIF_API_KEY` which you can get at [https://ndif.us/](https://ndif.us/)
- `WORKBENCH_DIR` pointing to the project location
- `HF_TOKEN` for accessing HuggingFace gated models

You'll also need to set up the root `.env` file. Clone the `.env.template` to the project root to get started.
