# Quick Start

Get LogitLens running in your environment.

## Option 1: Notebooks (Fastest)

No local setup required. Open the tutorial in Colab:

**[Open Tutorial in Colab](https://colab.research.google.com/github/ndif-team/workbench/blob/main/workbench/logitlens/notebooks/tutorial.ipynb)**

Or run locally:

```python
# Install
!pip install git+https://github.com/ndif-team/workbench.git

# Use
from nnsight import LanguageModel
from workbench.logitlens import collect_logit_lens, show_logit_lens

model = LanguageModel("openai-community/gpt2")
data = collect_logit_lens("The capital of France is", model, remote=False)
show_logit_lens(data)
```

## Option 2: Web Application

### Prerequisites

- [uv](https://docs.astral.sh/uv/getting-started/installation) - Python package manager
- [Node.js](https://nodejs.org/) - For the frontend

### Installation

```bash
# Clone the repository
git clone https://github.com/ndif-team/workbench.git
cd workbench

# Set up Python environment
uv venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv sync --extra dev

# Set up frontend
cd workbench/_web
npm install
cd ../..
```

### Configuration

Create `workbench/_api/.env`:

```bash
NDIF_API_KEY=<your key from https://ndif.us/>
HF_TOKEN=<your HuggingFace token>
```

For local-only testing (no NDIF), you can skip this - the backend will use local GPT-2.

### Running

```bash
# Terminal 1: Start frontend
./scripts/web.sh

# Terminal 2: Start backend
./scripts/api.sh
```

Open http://localhost:3000

## Using NDIF for Large Models

[NDIF](https://ndif.us) (National Deep Inference Fabric) provides free access to large models.

1. Get an API key at [nnsight.net](https://nnsight.net)
2. For notebooks: Add as a Colab secret named `NDIF_API`
3. For web app: Add to `workbench/_api/.env`

Then use `remote=True`:

```python
model = LanguageModel("meta-llama/Llama-3.1-70B", device_map="auto")
data = collect_logit_lens("The Eiffel Tower is", model, remote=True)
show_logit_lens(data)
```

## Verify Installation

Run the test suite:

```bash
# Quick widget tests (no servers needed)
./scripts/test.sh widget

# Full test suite (start frontend first)
./scripts/test.sh all
```

See the [Testing Guide](development/tests.md) for details.
