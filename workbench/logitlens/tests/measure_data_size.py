"""
Empirical measurement of logit lens data sizes with different options.

This script measures the JSON-serialized data size for different
collect_logit_lens configurations to provide accurate size estimates.

Usage:
    # From the workbench root directory:

    # Run with local GPT-2 model (no NDIF needed):
    uv run python -m workbench.logitlens.tests.measure_data_size

    # Run with a specific model via NDIF (requires NDIF API access):
    uv run python -m workbench.logitlens.tests.measure_data_size --model meta-llama/Llama-3.1-70B

    # Run with custom prompt:
    uv run python -m workbench.logitlens.tests.measure_data_size --prompt "Your custom prompt here"

The script measures JSON-serialized sizes for different configurations:
- Base (default k=5 per-position tracking)
- + include_rank (adds rank trajectories)
- + include_entropy (adds entropy per layer/position)
- + track_all_topk (global union of all top-k tokens)
- Combined options

Results help optimize bandwidth usage for NDIF remote execution.
"""

import argparse
import json
import sys
from typing import Dict, Any


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Measure logit lens data sizes with different options"
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model to test (default: openai-community/gpt2). Use NDIF model names for remote execution."
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Custom prompt to test (default: uses built-in short and medium prompts)"
    )
    parser.add_argument(
        "--remote",
        action="store_true",
        help="Use NDIF remote execution (required for large models like Llama-70B)"
    )
    return parser.parse_args()


def measure_json_size(data: Dict[str, Any]) -> int:
    """Measure JSON-serialized size in bytes."""
    # Convert tensors to lists for JSON serialization
    def to_serializable(obj):
        if hasattr(obj, "tolist"):
            return obj.tolist()
        if isinstance(obj, dict):
            return {k: to_serializable(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [to_serializable(item) for item in obj]
        return obj

    serializable = to_serializable(data)
    return len(json.dumps(serializable).encode("utf-8"))


def format_size(size_bytes: int) -> str:
    """Format size in human-readable form."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} MB"


def run_measurements(args=None):
    """Run data size measurements with different configurations."""
    if args is None:
        args = parse_args()

    try:
        from nnsight import LanguageModel
    except ImportError:
        print("ERROR: nnsight not installed. Install with: pip install nnsight")
        sys.exit(1)

    from workbench.logitlens.collect import collect_logit_lens
    from workbench.logitlens.display import to_js_format

    print("=" * 70)
    print("Logit Lens Data Size Measurements")
    print("=" * 70)

    # Test prompts
    if args.prompt:
        prompts = {"custom": args.prompt}
    else:
        prompts = {
            "short": "The capital of France is",  # ~5 tokens
            "medium": "The quick brown fox jumps over the lazy dog near the river bank",  # ~15 tokens
        }

    # Models to test
    if args.model:
        models_to_test = [(args.model, args.model)]
    else:
        models_to_test = [
            ("openai-community/gpt2", "GPT-2 (12 layers)"),
        ]

    # Determine if we should use remote execution
    use_remote = args.remote

    # Try to show info about model layers
    try:
        from transformers import AutoConfig
        for model_name, _ in models_to_test:
            try:
                config = AutoConfig.from_pretrained(model_name)
                n_layers = getattr(config, "num_hidden_layers", getattr(config, "n_layer", "?"))
                print(f"Note: {model_name} has {n_layers} layers")
            except Exception:
                pass
    except Exception:
        pass

    for model_name, model_desc in models_to_test:
        print(f"\n{'=' * 70}")
        print(f"Model: {model_desc}")
        print(f"Remote: {use_remote}")
        print(f"{'=' * 70}")

        try:
            if use_remote:
                # For remote execution, don't load weights locally
                model = LanguageModel(model_name)
            else:
                model = LanguageModel(model_name, device_map="cpu")
        except Exception as e:
            print(f"Could not load model: {e}")
            continue

        for prompt_name, prompt in prompts.items():
            print(f"\n--- Prompt: {prompt_name} ({len(prompt)} chars) ---")

            # Collect data with different configurations
            configs = [
                {"name": "Base (default)", "kwargs": {}},
                {"name": "+ include_rank", "kwargs": {"include_rank": True}},
                {"name": "+ include_entropy", "kwargs": {"include_entropy": True}},
                {"name": "+ include_rank + include_entropy", "kwargs": {"include_rank": True, "include_entropy": True}},
                {"name": "+ track_all_topk", "kwargs": {"track_all_topk": True}},
                {"name": "+ track_all_topk + include_rank", "kwargs": {"track_all_topk": True, "include_rank": True}},
            ]

            results = []

            for config in configs:
                try:
                    print(f"  Running: {config['name']}...", end=" ", flush=True)
                    data = collect_logit_lens(
                        prompt,
                        model,
                        k=5,
                        remote=use_remote,
                        **config["kwargs"]
                    )
                    print("done")

                    # Measure raw Python format size
                    raw_size = measure_json_size(data)

                    # Convert to JS format and measure
                    js_data = to_js_format(data)
                    js_size = measure_json_size(js_data)

                    # Count tokens and tracked tokens
                    n_tokens = len(data["input"])
                    n_layers = len(data["layers"])
                    avg_tracked = sum(len(t) for t in data["tracked"]) / len(data["tracked"])

                    results.append({
                        "name": config["name"],
                        "raw_size": raw_size,
                        "js_size": js_size,
                        "n_tokens": n_tokens,
                        "n_layers": n_layers,
                        "avg_tracked": avg_tracked,
                    })

                except Exception as e:
                    print(f"  {config['name']}: ERROR - {e}")

            # Print results table
            if results:
                base_js_size = results[0]["js_size"]
                print(f"\n  Tokens: {results[0]['n_tokens']}, Layers: {results[0]['n_layers']}")
                print(f"\n  {'Configuration':<40} {'JS Size':>12} {'vs Base':>10} {'Avg Tracked':>12}")
                print(f"  {'-' * 40} {'-' * 12} {'-' * 10} {'-' * 12}")

                for r in results:
                    ratio = r["js_size"] / base_js_size
                    print(f"  {r['name']:<40} {format_size(r['js_size']):>12} {ratio:>9.2f}x {r['avg_tracked']:>11.1f}")

    print("\n" + "=" * 70)
    print("Summary Notes:")
    print("=" * 70)
    print("""
- 'JS Size' is the JSON-serialized size sent to the browser
- 'vs Base' shows the size multiplier compared to default settings
- 'Avg Tracked' is the average number of tracked tokens per position
- For NDIF remote execution, data is transmitted as tensors (more compact)
  but the relative comparisons between options remain similar
""")


if __name__ == "__main__":
    run_measurements()
