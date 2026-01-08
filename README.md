# Workbench

An interpretability workbench for visualizing how transformer language models process text. The flagship tool is **LogitLens**, which shows how the model's predictions evolve across layers.

## Project Structure

```
workbench/
├── scripts/                    # Service startup and test runner
│   ├── api.sh                  # Start backend API server
│   ├── web.sh                  # Start frontend dev server
│   ├── test.sh                 # Unified test runner (see Testing below)
│   ├── docker.sh               # Docker entrypoint
│   └── modal.sh                # Modal deployment
│
├── workbench/                  # Main application code
│   ├── _api/                   # FastAPI backend
│   │   ├── main.py             # API entrypoint
│   │   ├── routes/             # API endpoints
│   │   └── tests/              # Backend pytest tests
│   │
│   ├── _web/                   # Next.js frontend
│   │   ├── src/                # React components and pages
│   │   ├── public/             # Static assets including widget JS
│   │   ├── scripts/            # Build and test orchestration
│   │   └── tests/              # Playwright browser tests
│   │
│   └── logitlens/              # Python module for notebook usage
│       ├── collect.py          # Data collection from models
│       ├── display.py          # Widget rendering for notebooks
│       ├── notebooks/          # Example Colab notebooks
│       └── tests/              # Module pytest tests
│
├── docker/                     # Docker configuration
├── modal/                      # Modal.com deployment
├── aws/                        # AWS deployment configs
└── docs/                       # Documentation
```

### Design Philosophy

- **Co-located tests**: Each component (`_api`, `_web`, `logitlens`) contains its own tests adjacent to the code
- **Unified test runner**: `scripts/test.sh` orchestrates all test types from one place
- **Dual interfaces**: The widget works both embedded in the web app and standalone in Jupyter/Colab notebooks
- **Local-first development**: Backend can run with local GPT-2 (`REMOTE=false`) for fast iteration without NDIF

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Interfaces                            │
├────────────────────────────────┬────────────────────────────────────────┤
│       Workbench Web App        │           Jupyter/Colab Notebook       │
│         (Next.js)              │                                        │
│   ┌────────────────────────┐   │   ┌────────────────────────────────┐   │
│   │ LogitLensWidgetEmbed   │   │   │      show_logit_lens()         │   │
│   │   (React wrapper)      │   │   │    (HTML wrapper for Jupyter)  │   │
│   └──────────┬─────────────┘   │   └──────────────┬─────────────────┘   │
│              │                 │                  │                     │
│              ▼                 │                  ▼                     │
│   ┌────────────────────────┐   │   ┌────────────────────────────────┐   │
│   │   LogitLens Widget JS  │   │   │      LogitLens Widget JS       │   │
│   │  (loaded via <script>) │   │   │    (embedded inline in HTML)   │   │
│   └──────────┬─────────────┘   │   └──────────────┬─────────────────┘   │
│              │                 │                  │                     │
│              ▼                 │                  ▼                     │
│   ┌────────────────────────┐   │   ┌────────────────────────────────┐   │
│   │   Workbench Backend    │   │   │   collect_logit_lens()         │   │
│   │      (FastAPI)         │   │   │      (called directly)         │   │
│   └──────────┬─────────────┘   │   └──────────────┬─────────────────┘   │
│              │                 │                  │                     │
└──────────────┼─────────────────┴──────────────────┼─────────────────────┘
               │                                    │
               ▼                                    ▼
         ┌─────────────────────────────────────────────────┐
         │            collect_logit_lens()                 │
         │   (shared data collection, workbench.logitlens) │
         └────────────────────────┬────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Inference Backend                               │
├─────────────────────────────────┬───────────────────────────────────────┤
│      Local Mode (testing)       │         NDIF (production)             │
│      GPT-2 via nnsight          │    Large models via ndif.us           │
│      REMOTE=false               │         REMOTE=true                   │
└─────────────────────────────────┴───────────────────────────────────────┘
```

**Key points:**
- **LogitLens Widget JS** renders visualizations in both environments
  - Web app: `LogitLensWidgetEmbed.tsx` loads it via `<script>` and calls `LogitLensWidget()` directly
  - Notebooks: `show_logit_lens()` embeds the widget JS inline in self-contained HTML
- **`collect_logit_lens()`** is the shared data collection implementation
  - Supports normalized models (via nnsight's `rename` feature) and native architectures
- Both can run against **Local Mode** (GPT-2) or **NDIF** (large models)

## Setup

### Requirements
1. [Install uv](https://docs.astral.sh/uv/) - Python package manager
2. [Install bun](https://bun.sh/) or npm - JavaScript package manager

### Installation

```bash
# Create and activate Python environment
uv venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv sync --extra dev

# Install frontend dependencies
cd workbench/_web
npm install
npx playwright install chromium  # For browser tests
```

### Configuration

Create `.env` files:

1. **Root `.env`** - Clone from `.env.template`

2. **`workbench/_api/.env`**:
   ```
   NDIF_API_KEY=<your key from https://ndif.us/>
   WORKBENCH_DIR=/path/to/workbench
   HF_TOKEN=<your HuggingFace token>
   ```

### Running

```bash
# Terminal 1: Start frontend
./scripts/web.sh

# Terminal 2: Start backend
./scripts/api.sh
```

Then open http://localhost:3000

## Testing

The project has two servers that tests may need:
- **Next.js frontend** (port 3000) - Serves the web UI
- **FastAPI backend** (port 8000) - Serves the model inference API

The test runner (`test.sh`) automatically starts and stops any servers needed for the requested tests.

### Quick Start

```bash
# Run all tests (servers started automatically)
./scripts/test.sh all

# Run fast tests that don't need servers
./scripts/test.sh widget     # Widget unit tests (~8s)
./scripts/test.sh backend    # Backend API tests (~27s)
./scripts/test.sh notebook   # Python module tests (~9s)
```

### Test Commands

| Command | Tests | Time | Servers (auto-started) |
|---------|-------|------|------------------------|
| `./scripts/test.sh widget` | 90 | ~16s | None |
| `./scripts/test.sh backend` | 9 | ~27s | None (pytest loads app directly) |
| `./scripts/test.sh notebook` | 33 | ~9s | None |
| `./scripts/test.sh integration` | 7 | ~13s | Next.js frontend |
| `./scripts/test.sh e2e` | 20 | ~2m | Next.js frontend + FastAPI backend |
| `./scripts/test.sh all` | ~160 | ~4m | Next.js frontend + FastAPI backend |
| `./scripts/test.sh colab` | 3 | ~1-2m | None (uses live Colab + NDIF) |

### Test Types

#### Widget Tests (`widget`)
Tests the LogitLens JavaScript widget in isolation using Playwright. No servers needed—loads widget directly from the filesystem.
- Initialization, rendering, hover interactions
- Pin/unpin tokens, metric switching (prob/rank)
- Dark mode, title editing, state serialization

#### Backend Tests (`backend`)
Python pytest tests for the FastAPI endpoints. No running server needed—pytest loads the app directly with a test client and uses local GPT-2.
- V2 lens endpoint with various options
- Grid and line chart endpoints
- Error handling and edge cases

#### Notebook Tests (`notebook`)
Python pytest tests for the `workbench.logitlens` module.
- Model architecture detection (GPT-2, Llama, Gemma, etc.)
- Data collection with `collect_logit_lens()`
- HTML/widget generation with `show_logit_lens()`

#### Integration Tests (`integration`)
React component tests with mocked backend API. Needs the **Next.js frontend** (auto-started).
- Component rendering without real inference
- API response handling

#### E2E Tests (`e2e`)
Full stack browser tests. Needs both **Next.js frontend** and **FastAPI backend** (both auto-started in local mode with GPT-2).
- Real model inference with GPT-2
- Complete user workflows

#### Colab Tests (`colab`)
Live integration tests with Google Colab and NDIF. No local servers—tests run against live Colab notebooks.

```bash
# Authenticate with Google (credentials expire after a few hours)
./scripts/test.sh colab:setup

# Run tests (headless)
./scripts/test.sh colab

# Run with browser visible
./scripts/test.sh colab --headed
```

**Setup requirements:**
- Run `colab:setup` to authenticate with Google (re-run when credentials expire, typically after a few hours)
- Configure `NDIF_API` secret in Colab (click key icon in sidebar)

### Running Tests Directly

```bash
# Pytest tests
uv run pytest workbench/_api/tests/ -v      # Backend
uv run pytest workbench/logitlens/tests/ -v # Module

# Playwright tests (from workbench/_web)
cd workbench/_web
npx playwright test tests/logitlens.spec.ts  # Widget
npx playwright test tests/e2e.spec.ts        # E2E
```

### Server Management

```bash
./scripts/test.sh start-servers  # Start frontend + backend for manual testing
./scripts/test.sh stop-servers   # Stop test servers
./scripts/test.sh help           # Show all commands
```

## Using LogitLens in Notebooks

The `workbench.logitlens` module can be used directly in Jupyter or Colab:

```python
from nnsight import LanguageModel
from workbench.logitlens import collect_logit_lens, show_logit_lens

model = LanguageModel("openai-community/gpt2")
data = collect_logit_lens("The capital of France is", model, k=5)
show_logit_lens(data)
```

For remote execution with larger models via NDIF:

```python
model = LanguageModel("meta-llama/Llama-3.1-8B", device_map="auto")
data = collect_logit_lens("The capital of France is", model, k=5, remote=True)
show_logit_lens(data)
```

See `workbench/logitlens/notebooks/` for complete examples.

## Documentation

### For Notebook Users

| Document | Description |
|----------|-------------|
| [LogitLens Python API](workbench/logitlens/README.md) | `collect_logit_lens()` and `show_logit_lens()` |
| [Tutorial Notebook](workbench/logitlens/notebooks/tutorial.ipynb) ([open in Colab](https://colab.research.google.com/github/davidbau/workbench/blob/main/workbench/logitlens/notebooks/tutorial.ipynb)) | Interactive walkthrough |
| [Data Format Specification](workbench/logitlens/DATA_FORMAT.md) | How data flows from model to widget |

### For Web/JavaScript Developers

| Document | Description |
|----------|-------------|
| [Widget JavaScript API](workbench/_web/src/lib/logit-lens-widget/API.md) | Embedding the widget in web pages |
| [Frontend README](workbench/_web/README.md) | Development and testing |

### General

| Document | Description |
|----------|-------------|
| [Quick Start](docs/src/quickstart.md) | Get running in 5 minutes |
| [Testing Guide](docs/src/development/tests.md) | Running the test suite |
