# LogitLens Python API

The Python API provides two main functions that divide work between server and client:

1. **`collect_logit_lens()`** - Runs the forward pass and performs server-side reduction, returning compact tensor data over the network.
2. **`show_logit_lens()`** - Converts tensor data to the widget's JSON format and renders an interactive visualization in Jupyter.

This separation optimizes for NDIF's remote execution model. Expensive computation (forward passes, softmax, top-k selection) happens on GPU servers, while only ~1 MB of summary data travels over the network. The client handles the lightweight task of formatting and display.

## Installation

```bash
pip install git+https://github.com/ndif-team/workbench.git
```

Or for development:
```bash
git clone https://github.com/ndif-team/workbench.git
cd workbench
uv sync --extra dev
```

## Quick Start

```python
from nnsight import LanguageModel
from workbench.logitlens import collect_logit_lens, show_logit_lens

# Load model
model = LanguageModel("openai-community/gpt2")

# Collect data (trajectories included by default)
data = collect_logit_lens("The capital of France is", model, remote=False)

# Display in Jupyter
show_logit_lens(data, title="Capital of France")
```

For large models via NDIF:

```python
model = LanguageModel("meta-llama/Llama-3.1-70B", device_map="auto")
data = collect_logit_lens("The Eiffel Tower is located in", model, remote=True)
show_logit_lens(data)
```

**[Open Tutorial in Colab](https://colab.research.google.com/github/ndif-team/workbench/blob/main/workbench/logitlens/notebooks/tutorial.ipynb)**

---

## Data Collection

### `collect_logit_lens`

```python
def collect_logit_lens(
    prompt: str,
    model,
    k: int = 5,
    layers: Optional[List[int]] = None,
    model_type: Optional[str] = None,
    remote: bool = True,
    track_tokens: Optional[List[str]] = None,
    track_all_topk: bool = False,
    include_rank: bool = False,
    include_entropy: bool = False,
) -> Dict
```

The primary entry point for collecting logit lens data. It runs a forward pass through the model, extracts hidden states at each layer, projects them to vocabulary space, and identifies the top-k predictions. To enable trajectory visualization, it also tracks the probability of every token that appears in top-k at any layer, recording how each token's probability evolves from early to late layers.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | str | required | Input text to analyze |
| `model` | LanguageModel | required | nnsight LanguageModel instance |
| `k` | int | 5 | Number of top predictions per layer/position |
| `layers` | List[int] | None | Specific layer indices to analyze (default: all layers) |
| `model_type` | str | None | Model architecture type. Auto-detected if None. Options: `"gpt2"`, `"llama"`, `"gemma"`, `"qwen2"`, `"phi"`, `"opt"` |
| `remote` | bool | True | Use NDIF remote execution |
| `track_tokens` | List[str] | None | Additional token strings to always track, beyond those discovered via top-k |
| `track_all_topk` | bool | False | If True, track the global union of all top-k tokens at every position. If False, only track per-position unions. Enabling produces more complete data but larger output. |
| `include_rank` | bool | False | Compute rank trajectories for tracked tokens |
| `include_entropy` | bool | False | Compute entropy at each layer/position |

#### Returns

Dict containing:

| Key | Type | Description |
|-----|------|-------------|
| `model` | str | Model name/path |
| `input` | List[str] | Input token strings |
| `layers` | List[int] | Layer indices analyzed |
| `topk` | Tensor[n_layers, seq_len, k] | Top-k token indices (int32) |
| `tracked` | List[Tensor] | Unique token indices per position (int32) |
| `probs` | List[Tensor[n_layers, n_tracked]] | Probability trajectories (float32) |
| `vocab` | Dict[int, str] | Token index to string mapping |
| `ranks` | List[Tensor] | (if `include_rank=True`) Rank trajectories |
| `entropy` | Tensor[n_layers, seq_len] | (if `include_entropy=True`) Entropy values |

Note: Top-k probabilities are not stored separately since they can be looked up from the `probs` trajectories, reducing bandwidth.

#### Examples

```python
# Basic usage
data = collect_logit_lens(
    "The capital of France is",
    model,
    k=5,
    remote=True
)

# Access results
print(data["input"])      # ['The', ' capital', ' of', ' France', ' is']
print(data["topk"].shape) # [80, 5, 5] for 80 layers, 5 positions, k=5

# Analyze specific layers only (faster)
data = collect_logit_lens(
    "Test prompt",
    model,
    layers=[0, 10, 20, 30, 40],  # Every 10th layer
    remote=True
)

# Track specific tokens of interest
data = collect_logit_lens(
    "The capital of France is",
    model,
    track_tokens=[" Paris", " London", " Berlin"],  # Always track these
    remote=True
)

# Include rank data for rank-mode visualization
data = collect_logit_lens(
    "Test prompt",
    model,
    include_rank=True,
    remote=True
)
```

#### Bandwidth

For Llama-70B (80 layers, 128k vocab, 14 tokens):
- Naive (full logits): ~547 MB
- This function (top-5 with trajectories): ~810 KB

---

## Display

### `show_logit_lens`

```python
def show_logit_lens(
    data: Dict,
    title: Optional[str] = None,
    container_id: Optional[str] = None,
    **ui_options,
) -> HTML
```

Converts raw tensor data to JSON format and renders an interactive logit lens visualization in Jupyter. The output is self-contained HTML that includes all necessary JavaScript and CSS, so it works without any widget installation or external dependencies.

The visualization supports clicking cells to see top-k predictions, pinning tokens to compare trajectories, and switching between probability and rank display modes.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | Dict | required | Data from `collect_logit_lens()` or `to_js_format()` |
| `title` | str | None | Optional title for the widget |
| `container_id` | str | None | Optional container ID (auto-generated if omitted) |

#### UI Options (`**ui_options`)

All additional keyword arguments are passed to the JavaScript widget as UI configuration. Use snake_case in Python—it's automatically converted to camelCase for JavaScript.

**Display options** control the visual appearance:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dark_mode` | bool | None | Force dark (`True`) or light (`False`) mode. `None` auto-detects from browser. |
| `chart_height` | int | 200 | Height of the trajectory chart in pixels. |
| `input_token_width` | int | 100 | Width of the input token column in pixels. |
| `cell_width` | int | 44 | Width of each prediction cell in pixels. |
| `max_rows` | int | None | Maximum visible rows. `None` shows all rows. |
| `max_table_width` | int | None | Maximum table width in pixels. `None` fits to content. |
| `plot_min_layer` | int | 0 | First layer shown in the trajectory chart. |

**Color options** control cell background coloring:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `color_modes` | list | ["top"] | List of color modes to cycle through. Common values: `"top"` (color by top-1 probability), `"none"` (no coloring), or a token string (color by that token's probability). |
| `color_index` | int | 0 | Initial color mode index. |

#### Returns

IPython HTML object that displays the interactive widget when rendered in a Jupyter cell.

#### Examples

```python
from workbench.logitlens import collect_logit_lens, show_logit_lens

data = collect_logit_lens("The capital of France is", model, remote=True)

# Basic usage
show_logit_lens(data, title="France Capital")

# Force dark mode with a taller chart
show_logit_lens(data, title="Dark Mode", dark_mode=True, chart_height=250)

# Limit visible rows for long prompts
show_logit_lens(data, title="Long prompt", max_rows=10)

# Color cells by a specific token's probability
show_logit_lens(data, title="Paris tracking", color_modes=[" Paris", "top"])
```

---

### `to_js_format`

```python
def to_js_format(data: Dict) -> Dict
```

Converts raw tensor data from `collect_logit_lens()` into the V2 JSON format that the JavaScript widget expects. Use it when you need the formatted data for purposes other than immediate display—for example, saving to a file, sending to a web server, or embedding in a custom HTML page.

The conversion extracts token strings from the vocab mapping and restructures the probability data into the compact format described in [DATA_FORMAT.md](DATA_FORMAT.md). The resulting dict can be serialized to JSON and loaded directly by the JavaScript widget.

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | Dict | Raw data from `collect_logit_lens()` |

#### Returns

Dict in widget-compatible V2 format with keys: `meta`, `input`, `layers`, `topk`, `tracked`.

#### Example

```python
from workbench.logitlens import collect_logit_lens
from workbench.logitlens.display import to_js_format
import json

data = collect_logit_lens("Hello world", model, remote=True)
js_data = to_js_format(data)

# Save to file for later use
with open("analysis.json", "w") as f:
    json.dump(js_data, f)

# Or embed in HTML
html = f'<script>var data = {json.dumps(js_data)};</script>'
```

---

## Supported Models

The module auto-detects model architecture. Supported types:

| Architecture | Example Models |
|--------------|----------------|
| `gpt2` | `gpt2`, `gpt2-medium`, `gpt2-large`, `gpt2-xl` |
| `gpt_neo` | `gpt-neo-*`, `gpt-j-*` |
| `llama` | `Llama-2-*`, `Llama-3-*`, `Mistral-*`, `Mixtral-*` |
| `gemma` | `gemma-*`, `gemma-2-*` |
| `qwen2` | `Qwen-*`, `Qwen2-*` |
| `phi` | `phi-*` |
| `opt` | `opt-*` |

If auto-detection fails, pass `model_type` explicitly:

```python
data = collect_logit_lens(prompt, model, model_type="llama", remote=True)
```

---

## Data Size Reference

Empirically measured JSON sizes for different configurations. Use this to estimate bandwidth requirements for NDIF remote execution.

### GPT-2 (12 layers)

| Configuration | 5 tokens | 13 tokens | vs Base |
|--------------|----------|-----------|---------|
| Base (default) | 10.8 KB | 30.3 KB | 1.00x |
| + include_rank | 15.6 KB | 43.9 KB | 1.45x |
| + include_entropy | 11.3 KB | 31.7 KB | 1.05x |
| + track_all_topk | 31.7 KB | 176.3 KB | 3-6x |

### Llama 3.1 70B (80 layers)

| Configuration | 6 tokens | 14 tokens | vs Base |
|--------------|----------|-----------|---------|
| Base (default) | 316 KB | 810 KB | 1.00x |
| + include_rank | 557 KB | 1.43 MB | 1.76-1.81x |
| + include_entropy | 320 KB | 819 KB | 1.01x |
| + track_all_topk | 1.35 MB | 7.28 MB | 4-9x |

### Recommendations

1. **Use `include_rank=False`** unless rank visualization is needed (+45-80% size)
2. **Use `track_all_topk=False`** for most cases—per-position tracking is sufficient (4-20x smaller)
3. **`include_entropy=True`** has minimal overhead (+1-5%), enable if useful

---

## Further Reading

- [Tutorial Notebook](notebooks/tutorial.ipynb) - Interactive walkthrough on Colab
- [Data Format Specification](DATA_FORMAT.md) - How data flows from model to widget, V1/V2 formats, design rationale
- [Widget JavaScript API](../_web/src/lib/logit-lens-widget/API.md) - For embedding in web pages

---

## Troubleshooting

**"Model not supported"**: The module auto-detects architectures. For unusual models, try passing `model_type="llama"` or `model_type="gpt2"` explicitly.

**NDIF timeout**: Large models on long prompts may take 30+ seconds. The first call also warms up the model.

**Widget not displaying**: Ensure you're in a Jupyter environment with HTML display support. Colab works out of the box.

**Missing NDIF API key**: Get one at [nnsight.net](https://nnsight.net) and set it as a Colab secret named `NDIF_API` or as an environment variable.
