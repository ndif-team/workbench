# Data Format Specification

The LogitLens module uses a carefully designed data format optimized for a specific workflow: collecting logit lens data from **large language models running on remote GPU servers** (NDIF) and visualizing it in **browser-based interactive widgets**.

The core challenge is **bandwidth**: a single forward pass through Llama-70B produces ~550 MB of logit data per prompt. Transmitting this for every analysis would be impractical. Our format reduces this to **<1 MB** by computing summaries on the server and transmitting only what the visualization needs.

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Raw Python Format](#raw-python-format) - Server output, tensor-based
3. [Widget JSON Formats](#widget-json-formats) - Browser input, string-based
4. [Format Conversion](#format-conversion)
5. [Rationale and Design Decisions](#rationale-and-design-decisions)
6. [Size Analysis](#size-analysis)
7. [Limitations](#limitations)

---

## Pipeline Overview

The data flows through four stages, with dramatic size reduction happening on the server:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LOGIT LENS DATA PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Hidden    │    │    Full     │    │  Top-K +    │    │   Widget    │  │
│  │   States    │───▶│   Logits    │───▶│ Trajectories│───▶│    JSON     │  │
│  │  (Server)   │    │  (Server)   │    │  (Server)   │    │  (Client)   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│       35 MB            547 MB             320 KB            823 KB         │
│                                                                              │
│  ◀──────────────── NDIF Server ────────────────▶ ◀──── Transmitted ────▶   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Stage 1: Hidden States** - The model's internal representations at each layer. Large but manageable.

**Stage 2: Full Logits** - Hidden states projected to vocabulary space (128k tokens). This is where size explodes: `80 layers × seq_len × 128k × 4 bytes`.

**Stage 3: Top-K + Trajectories** - The critical reduction step. We keep only:
- Which tokens are in the top-k at each layer/position (indices, not probabilities)
- Probability trajectories for tokens that *ever* appear in top-k

**Stage 4: Widget JSON** - Token indices decoded to strings, formatted for JavaScript consumption.

The key insight: **all expensive computation happens on the NDIF server**. The client receives only the ~1000 unique tokens and their probability curves needed for visualization.

---

## Raw Python Format

This is what `collect_logit_lens()` returns - the format transmitted from the NDIF server to your Python client. It uses **tensors** (not strings) because tensor operations are efficient and the data will be further processed before visualization.

```python
{
    "model": str,                     # Model name/path
    "input": List[str],               # Input token strings
    "layers": List[int],              # Layer indices analyzed
    "topk": Tensor,                   # [n_layers, seq_len, k] - int32, indices only
    "tracked": List[Tensor],          # Per-position unique token indices (int32)
    "probs": List[Tensor],            # Per-position probability trajectories (float32)
    "vocab": Dict[int, str],          # Token index -> string mapping
}
```

### Why This Structure?

The format is organized around two complementary views of the same data:

1. **`topk`** - "What does the model predict at each layer?" Answers the question cell-by-cell.
2. **`tracked` + `probs`** - "How do specific tokens' probabilities evolve?" Answers the trajectory question.

These are separated because they have different shapes and access patterns. The visualization needs both: `topk` to populate the grid cells, and `probs` to draw the trajectory charts.

### Field Details

#### `model`
Model identifier for provenance tracking:
```python
"meta-llama/Llama-3.1-70B-Instruct"
```

#### `input`
The prompt tokenized and decoded back to strings. This is what appears as row labels in the visualization. Leading spaces are preserved because they're semantically meaningful (` the` vs `the`):
```python
["<|begin_of_text|>", "The", " quick", " brown", " fox"]
```

#### `layers`
Which layers were analyzed. Usually all of them, but can be a subset for faster analysis:
```python
[0, 1, 2, ..., 79]  # All 80 layers (default)
[0, 10, 20, ..., 70]  # Every 10th layer (faster)
```

#### `topk`
**The grid data.** A 3D tensor of shape `[n_layers, seq_len, k]` containing token indices ranked by probability at each cell:
```python
topk[layer, position, rank]  # -> vocabulary index (int32)
topk[5, 3, 0]  # Top-1 prediction at layer 5, position 3
topk[5, 3, :]  # All k predictions at that cell
```

**Why no probabilities here?** Because they're redundant - every token in `topk` is also in `tracked`, so its probability at any layer can be looked up from `probs`. Omitting duplicate probability data saves bandwidth.

#### `tracked`
**The trajectory index.** For each input position, which tokens should we track? This is the union of all tokens that appeared in top-k at *any* layer:
```python
tracked[0]  # Tensor([1234, 5678, 9012, ...]) — typically 20-140 tokens
tracked[3]  # Different set for position 3
```

Note: We track the union across all layers because a token's rank can change dramatically - a token ranked #47 at layer 0 might become #1 by layer 40. Tracking only the final layer's top-k would miss these transitions, which are often the most informative part of the visualization.

#### `probs`
**The trajectory data.** For each position, a matrix of probability values across layers:
```python
probs[0]        # Shape: [n_layers, n_tracked] e.g., [80, 101]
probs[0][:, i]  # Trajectory for tracked[0][i] across all 80 layers
probs[0][j, i]  # Probability at layer j for token tracked[0][i]
```

This is the heart of the logit lens visualization - watching how token probabilities rise and fall as information flows through the network.

#### `vocab`
Token indices to strings for everything in `topk` and `tracked`:
```python
vocab[1234]  # " the"
vocab[5678]  # " Paris"
```

Why include this? So downstream code doesn't need access to the model's tokenizer. The data becomes self-contained - you can save it to disk, send it to another machine, or convert it to widget JSON without having the model loaded.

---

## Widget JSON Formats

The JavaScript widget needs data in a different form than the Python format:

- **Strings instead of indices** - JavaScript will display tokens, not look them up
- **JSON-serializable** - No tensors, just arrays and objects
- **Trajectory deduplication** - Each trajectory stored once, referenced many times

LogitLensWidget accepts two JSON formats. **V2 is recommended** for all new implementations.

### V2 Format (Compact)

V2 is organized around the insight that trajectories are the expensive part - and each unique token's trajectory only needs to be stored once per position, not once per layer where it appears.

```javascript
{
  "meta": {
    "version": 2,
    "timestamp": "2026-01-02T03:00:07.704214+00:00",
    "model": "meta-llama/Llama-3.1-70B"
  },
  "layers": [0, 1, 2, ..., 79],
  "input": ["<|begin_of_text|>", "Why", " do", " electric", ...],
  "tracked": [
    // Position 0: {token_string: trajectory_array}
    {
      " the": [0.05, 0.06, 0.08, ...],   // 80 values, one per layer
      " a": [0.03, 0.04, 0.05, ...],
      "Question": [0.0, 0.0, ..., 0.31]  // Only significant at final layer
    },
    // Position 1
    { ... },
    // ... more positions
  ],
  "topk": [
    // Layer 0: [[pos0 tokens], [pos1 tokens], ...]
    [[" the", " a", " an"], [" quick", " fast"], ...],
    // Layer 1
    [[" the", " a"], [" brown", " quick"], ...],
    // ... more layers
  ]
}
```

#### V2 Structure

| Field | Type | Description |
|-------|------|-------------|
| `meta` | object | Metadata (version, timestamp, model) |
| `meta.version` | number | Must be `2` |
| `meta.timestamp` | string | ISO 8601 timestamp |
| `meta.model` | string | Model identifier (optional) |
| `layers` | number[] | Layer indices analyzed |
| `input` | string[] | Input token strings |
| `tracked` | object[] | Per-position dict: token -> trajectory |
| `topk` | string[][][] | `[layer][position]` -> top-k token strings |

#### Key V2 Characteristics

1. **Trajectories stored once**: Each unique token's trajectory is stored exactly once in `tracked[position][token]`
2. **Token strings in topk**: No indices, just decoded strings for display
3. **Metadata included**: Model name and timestamp for provenance
4. **Input not tokens**: Field renamed from `tokens` to `input` for clarity

### V1 Format (Legacy)

Still supported for backward compatibility. Each cell duplicates trajectory data.

```javascript
{
  "layers": [0, 1, 2, 3],
  "tokens": ["The", " quick", " brown", " fox"],
  "cells": [
    // Position 0
    [
      // Layer 0
      {
        "token": " the",           // Top-1 predicted token
        "prob": 0.1234,            // Top-1 probability at this layer
        "trajectory": [0.12, 0.14, 0.16, 0.18],  // Same trajectory repeated!
        "topk": [
          {"token": " the", "prob": 0.12, "trajectory": [0.12, 0.14, 0.16, 0.18]},
          {"token": " a", "prob": 0.09, "trajectory": [0.09, 0.08, 0.07, 0.06]},
          {"token": " an", "prob": 0.05, "trajectory": [0.05, 0.04, 0.03, 0.02]}
        ]
      },
      // Layer 1 - same trajectories repeated again
      {
        "token": " the",
        "prob": 0.1456,
        "trajectory": [0.12, 0.14, 0.16, 0.18],  // Duplicate!
        "topk": [...]
      },
      // ... more layers
    ],
    // ... more positions
  ]
}
```

#### V1 Redundancy Problem

In V1, the same trajectory array appears multiple times:
- Once in `cell.trajectory` (top-1)
- Once in `cell.topk[0].trajectory` (also top-1)
- At every layer where the token appears in top-k

For 80 layers x 5 top-k x 14 positions = **5,600 trajectory copies**, when only ~1,400 unique trajectories exist. This is the **4x duplication** that V2 eliminates.

---

## Format Conversion

The Python format (tensors + vocab dict) must be converted to widget JSON format (all strings) before display. This happens automatically in `show_logit_lens()`, but you can do it manually:

### Python to Widget (V2)

```python
from nnsight import LanguageModel
from workbench.logitlens import collect_logit_lens, show_logit_lens
from workbench.logitlens.display import to_js_format

# Load model
model = LanguageModel("openai-community/gpt2")

# Collect raw data (local or via NDIF)
raw_data = collect_logit_lens("The capital of France is", model, remote=False)

# Convert to V2 widget format
widget_data = to_js_format(raw_data)

# Now JSON-serializable
import json
json_str = json.dumps(widget_data)
```

The conversion does three things:
1. Decodes token indices to strings using `vocab`
2. Reorganizes `probs` matrices into per-token trajectory dicts
3. Adds metadata (version, timestamp, model name)

### JavaScript Normalization

The widget automatically normalizes V2 to its internal format on load:

```javascript
// Both work identically
LogitLensWidget('#container', v2Data);  // V2 auto-normalized
LogitLensWidget('#container', v1Data);  // V1 used directly
```

Internally, V2 data is expanded to V1 structure, but **trajectory arrays are shared by reference**, so there's no memory duplication at runtime:

```javascript
// During normalization (simplified)
var trajectory = trackedAtPos[token];  // Reference to V2 array
topkList.push({
    token: token,
    prob: trajectory[layerIndex],
    trajectory: trajectory  // Same reference, no copy
});
```

---

## Rationale and Design Decisions

### Why Server-Side Reduction?

NDIF (National Deep Inference Fabric) runs large models on remote GPUs. The bottleneck is **network bandwidth**, not computation:

| Operation | Location | Cost |
|-----------|----------|------|
| Forward pass | Server | Cheap (GPU) |
| Softmax | Server | Cheap |
| Top-K selection | Server | Cheap |
| Unique token finding | Server | Cheap |
| Data transmission | Network | **Expensive** |

Computing top-k on the server reduces transmission from 547 MB to <1 MB.

### Why Track Across Layers?

The visualization shows how token probabilities **evolve** across layers. Without trajectory tracking, we'd only see snapshots at each layer with no continuity.

`collect_logit_lens()` always computes trajectories because they're essential for the visualization:
1. Finds all tokens appearing in top-k at **any** layer
2. Extracts their probabilities at **all** layers
3. Enables the smooth trajectory charts that make patterns visible

### Why V2 Over V1?

| Concern | V1 | V2 |
|---------|----|----|
| File size | Larger (trajectory duplication) | ~70% smaller |
| Parse time | Slower (more data) | Faster |
| Memory (in browser) | Same after normalization | Same |
| Simplicity | Denormalized, self-contained | Normalized, requires lookup |
| Backward compat | Native | Requires normalization |

V2 was introduced for NDIF bandwidth optimization. The JavaScript normalizes V2->V1 internally, so both formats have identical runtime behavior.

### Why JSON Instead of Binary?

1. **Debuggability**: JSON is human-readable
2. **Browser compatibility**: Native `JSON.parse()` is fast
3. **Jupyter integration**: Easy embedding in HTML output
4. **Compression**: JSON compresses well with gzip (~70% reduction)

For very large datasets, binary formats (e.g., MessagePack, Protocol Buffers) could be considered, but JSON is sufficient for typical prompt lengths.

---

## Size Analysis

### Llama 3.1 70B Example (14 tokens, 80 layers)

| Stage | Description | Size | Reduction |
|-------|-------------|------|-----------|
| Hidden States | Raw activations per layer | 35.0 MB | baseline |
| Full Logits | Projected to vocabulary | **546.9 MB** | - |
| Top-K Only | Indices + probabilities | 43.8 KB | 12,800x |
| With Trajectories | + tracked token probs | 491.1 KB | 1,140x |
| V2 JSON | Widget-ready format | 822.8 KB | **681x** |

### Actual Measurements

| Dataset | Model | Tokens | Layers | V2 Size |
|---------|-------|--------|--------|---------|
| Preview (Llama) | Llama-3.1-70B | 14 | 80 | 823 KB |
| Preview (GPT-J) | GPT-J-6B | 13 | 28 | 107 KB |
| Test fixture | Synthetic | 4 | 4 | 1.0 KB |

### V1 vs V2 Format Comparison

| Metric | V1 Format | V2 Format | Savings |
|--------|-----------|-----------|---------|
| Test fixture (4x4) | 3.3 KB | 1.0 KB | 69% |
| Trajectory arrays | 36 | 15 | 58% |
| Llama preview (est.) | 3.0 MB | 823 KB | 73% |

The V2 format achieves **~70% reduction** over V1 by eliminating trajectory duplication.

### Configuration Options Impact

Different `collect_logit_lens()` options affect output size significantly:

| Configuration | GPT-2 (13 tokens) | Llama-70B (14 tokens) | vs Base |
|--------------|-------------------|------------------------|---------|
| Base (default) | 30.3 KB | 810 KB | 1.00x |
| + include_rank | 43.9 KB | 1.43 MB | 1.45-1.8x |
| + include_entropy | 31.7 KB | 819 KB | 1.05x |
| + track_all_topk | 176.3 KB | 7.28 MB | 4-9x |

See [README.md](README.md) for detailed measurements and recommendations.

---

## Limitations

### Scalability

| Prompt Length | Layers | Approx V2 Size | Notes |
|---------------|--------|----------------|-------|
| 14 tokens | 80 | 823 KB | Comfortable |
| 100 tokens | 80 | ~6 MB | Reasonable |
| 1000 tokens | 80 | ~60 MB | May need streaming |
| 4096 tokens | 80 | ~240 MB | Not recommended |

For very long prompts, consider:
- Analyzing a subset of layers (every 4th)
- Reducing top-k from 5 to 3
- Analyzing subsequences separately

### Precision

Probabilities are stored as floats with 5 decimal places:
```python
[round(p, 5) for p in trajectory]
```

This is sufficient for visualization but may lose precision for very small probabilities (<0.00001).

### Token Decoding

Token strings depend on tokenizer behavior:
- Special tokens: `<|begin_of_text|>`, `<s>`, etc.
- Spaces preserved: `" the"` vs `"the"`
- Unicode: Some tokenizers produce unusual characters

The widget displays tokens as-is; escaping/formatting is the caller's responsibility.

### Missing Trajectories

If you construct widget data manually and a token appears in `topk` but not in `tracked`, the widget will show it with zero probability. Always ensure that every token in `topk` has a corresponding trajectory in `tracked`/`probs`.

---

## Example Data Files

| File | Format | Description |
|------|--------|-------------|
| `../_web/tests/fixtures/simple-test.json` | V2 | 4 layers x 4 tokens, minimal test |
| `../_web/tests/fixtures/llama-70b-sample.json` | V2 | Llama-3.1-70B, 80 layers x 14 tokens |

These files can be used directly with the widget:

```javascript
// Load and display
fetch('simple-test.json')
  .then(r => r.json())
  .then(data => LogitLensWidget('#container', data));
```
