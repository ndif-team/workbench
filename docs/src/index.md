# NDIF Workbench

An interpretability workbench for visualizing how transformer language models process text. The flagship tool is **LogitLens**, which reveals how model predictions evolve layer-by-layer.

## What is LogitLens?

The logit lens technique projects intermediate hidden states at each layer to vocabulary space, showing what the model would predict if it stopped at that layer. This reveals:

- How early layers build basic representations
- When the model "decides" on its final prediction
- How alternative predictions rise and fall through the network

## Two Ways to Use It

### 1. Jupyter/Colab Notebooks

The simplest way to explore logit lens visualizations:

```python
from nnsight import LanguageModel
from workbench.logitlens import collect_logit_lens, show_logit_lens

model = LanguageModel("openai-community/gpt2")
data = collect_logit_lens("The capital of France is", model, remote=False)
show_logit_lens(data)
```

For large models via NDIF:

```python
model = LanguageModel("meta-llama/Llama-3.1-70B", device_map="auto")
data = collect_logit_lens("The Eiffel Tower is located in", model, remote=True)
show_logit_lens(data)
```

**[View the tutorial notebook](https://colab.research.google.com/github/ndif-team/workbench/blob/main/workbench/logitlens/notebooks/tutorial.ipynb)**

### 2. Web Application

A full-featured web app for interactive exploration:

```bash
# Start frontend
./scripts/web.sh

# Start backend (separate terminal)
./scripts/api.sh
```

Then open http://localhost:3000

## Documentation

| Guide | Description |
|-------|-------------|
| [Quick Start](quickstart.md) | Get running in 5 minutes |
| [Testing Guide](development/tests.md) | Running the test suite |
| [Python API](https://github.com/ndif-team/workbench/blob/main/workbench/logitlens/README.md) | `collect_logit_lens` and `show_logit_lens` |
| [Data Format](https://github.com/ndif-team/workbench/blob/main/workbench/logitlens/DATA_FORMAT.md) | Technical specification |
| [JavaScript Widget](https://github.com/ndif-team/workbench/blob/main/workbench/_web/src/lib/logit-lens-widget/API.md) | Embedding the widget |

## Key Features

- **Layer-by-layer predictions**: See how the model's top predictions change at each layer
- **Trajectory visualization**: Track how specific token probabilities rise and fall
- **Pin and compare**: Click to pin a trajectory, then hover to compare others
- **Probability and rank modes**: Switch between probability values and ranking
- **NDIF integration**: Run 70B+ parameter models remotely via [NDIF](https://ndif.us)
- **Zero-install notebooks**: Widget works in Colab without any package installation
