# Workbench

## Setup

### Requirements
1. [Install uv](https://docs.astral.sh/uv/)
1. [Install bun](https://bun.sh/)

### Steps
1. Create a venv using `uv venv`
1. Activate it afterwards using the printed command
1. Run `uv sync`
1. Change to `workbench/_web/`
1. Run `bun install`

Make sure you've set up:
- `NDIF_API_KEY` which you can get at [https://ndif.us/](https://ndif.us/)
- `WORKBENCH_DIR` pointing to the project location
- `HF_TOKEN` for accessing gated models

You'll also need to set up the `.env` file. Clone the `.env.template` to get started.
