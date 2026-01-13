"""
Jupyter display utilities for logit lens visualization.

Provides zero-install HTML output - no ipywidgets required.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
from IPython.display import HTML, display


# CDN fallback URL
_WIDGET_JS_CDN_URL = "https://davidbau.github.io/logitlenskit/js/dist/logit-lens-widget.min.js"

# Local static file path
_STATIC_DIR = Path(__file__).parent / "static"
_WIDGET_JS_LOCAL = _STATIC_DIR / "logit-lens-widget.min.js"


def _get_widget_js() -> str:
    """Get widget JavaScript, preferring local file over CDN."""
    if _WIDGET_JS_LOCAL.exists():
        return _WIDGET_JS_LOCAL.read_text(encoding="utf-8")
    return None


def _get_widget_url() -> str:
    """Get widget URL for loading from CDN."""
    return _WIDGET_JS_CDN_URL


def to_js_format(data: Dict) -> Dict:
    """
    Convert Python API format to JavaScript V2 format.

    Args:
        data: Dict from collect_logit_lens() with keys:
            model, input, layers, topk, tracked, probs, vocab
            Optional: ranks (if include_rank=True), entropy (if include_entropy=True)

    Returns:
        Dict in JavaScript V2 format with keys:
            meta, input, layers, topk, tracked
            Optional: entropy (2D array if present in input)

    Example:
        >>> js_data = to_js_format(data)
        >>> json.dumps(js_data)  # Ready for JavaScript
    """
    vocab = data["vocab"]
    n_layers = len(data["layers"])
    n_pos = len(data["input"])
    has_ranks = "ranks" in data
    has_entropy = "entropy" in data

    # topk: [n_layers, n_pos, k] indices -> [n_layers][n_pos] string lists
    topk_js = [
        [[vocab[idx.item()] for idx in data["topk"][li, pos]]
         for pos in range(n_pos)]
        for li in range(n_layers)
    ]

    # tracked/probs: parallel arrays -> {token: trajectory or TrackedTrajectory} dicts per position
    # If ranks are present, use TrackedTrajectory format: {prob: [...], rank: [...]}
    tracked_js = []
    for pos in range(n_pos):
        pos_dict = {}
        for i, idx in enumerate(data["tracked"][pos]):
            token = vocab[idx.item()]
            prob_traj = [round(p, 5) for p in data["probs"][pos][:, i].tolist()]

            if has_ranks:
                # TrackedTrajectory format with both prob and rank
                rank_traj = [int(r) for r in data["ranks"][pos][:, i].tolist()]
                pos_dict[token] = {"prob": prob_traj, "rank": rank_traj}
            else:
                # Simple array format (probability only)
                pos_dict[token] = prob_traj
        tracked_js.append(pos_dict)

    result = {
        "meta": {"version": 2, "model": data["model"]},
        "input": data["input"],
        "layers": data["layers"],
        "topk": topk_js,
        "tracked": tracked_js,
    }

    # Add entropy if present: [n_layers, n_pos] -> [n_layers][n_pos]
    if has_entropy:
        result["entropy"] = [
            [round(e, 5) for e in data["entropy"][li].tolist()]
            for li in range(n_layers)
        ]

    return result


def _is_js_format(data: Dict) -> bool:
    """Check if data is already in JavaScript V2 format."""
    return "meta" in data and "tracked" in data and isinstance(data["tracked"][0], dict)


def _is_python_format(data: Dict) -> bool:
    """Check if data is in Python API format."""
    return "vocab" in data and "topk" in data and "probs" in data


def _snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    components = name.split("_")
    return components[0] + "".join(x.capitalize() for x in components[1:])


def show_logit_lens(
    data: Dict,
    title: Optional[str] = None,
    container_id: Optional[str] = None,
    **ui_options,
) -> HTML:
    """
    Display interactive logit lens visualization in Jupyter.

    This generates self-contained HTML that works without any widget
    installation. The visualization is fully interactive.

    Args:
        data: Data from collect_logit_lens() (Python format) or
              already converted to_js_format() (JavaScript V2 format)
        title: Optional title for the widget
        container_id: Optional container ID (auto-generated if not provided)
        **ui_options: UI options (snake_case converted to camelCase):

            Layout options:
                dark_mode: Force dark (True) or light (False) mode. None for auto.
                chart_height: Height of the chart area in pixels.
                input_token_width: Width of input token column (default: 100).
                cell_width: Width of prediction cells (default: 44).
                max_rows: Maximum rows to display (None for all).
                max_table_width: Maximum table width in pixels.

            Chart options:
                plot_min_layer: Minimum layer shown in chart.
                color_modes: Color modes list, e.g. ["top", "Paris"].
                color_index: Current color mode index.
                heatmap_base_color: Base heatmap color (hex, e.g. "#4169e1").
                heatmap_next_color: Next-token heatmap color (hex).
                trajectory_metric: "probability" or "rank" for chart Y-axis.

            Pinning options:
                pinned_rows: Pinned rows, e.g. [{"pos": 4, "line": "solid"}].
                             Pass [] to disable auto-pinning of last row.
                             Default (None) auto-pins the last input token.
                pinned_groups: Pinned token groups.

            Visibility options:
                show_heatmap: Show/hide the heatmap table.
                show_chart: Show/hide the probability chart.

    Returns:
        IPython HTML object that displays the widget

    Example:
        >>> data = collect_logit_lens("The capital of France is", model)
        >>> show_logit_lens(data, title="GPT-2 Analysis")

        # Disable auto-pinning of last row
        >>> show_logit_lens(data, pinned_rows=[])

        # Pin specific rows with dark mode
        >>> show_logit_lens(data, pinned_rows=[{"pos": 0, "line": "solid"}], dark_mode=True)
    """
    import uuid

    if container_id is None:
        container_id = f"logit-lens-{uuid.uuid4().hex[:8]}"

    # Convert to JS format if needed
    if _is_python_format(data):
        widget_data = to_js_format(data)
    elif _is_js_format(data):
        widget_data = data
    else:
        raise ValueError(
            "Unrecognized data format. Expected output from collect_logit_lens() "
            "or to_js_format()."
        )

    # Build UI state from kwargs (convert snake_case to camelCase)
    ui_state: Dict[str, Any] = {}

    # Add title if provided
    if title:
        ui_state["title"] = title

    # Convert all ui_options from snake_case to camelCase
    for key, value in ui_options.items():
        camel_key = _snake_to_camel(key)
        ui_state[camel_key] = value

    # Try to embed local JS, fall back to CDN
    local_js = _get_widget_js()

    if local_js:
        # Embed widget JS directly for better offline support
        html = f"""
        <div id="{container_id}" style="background: white; padding: 20px; border-radius: 8px;"></div>
        <script>
        (function() {{
            var data = {json.dumps(widget_data)};
            var uiState = {json.dumps(ui_state)};
            var containerId = "{container_id}";

            // Check if LogitLensWidget is already loaded
            if (typeof LogitLensWidget === 'undefined') {{
                {local_js}
            }}

            // Wait for container to exist in DOM (handles async rendering in Jupyter/Colab)
            function initWidget() {{
                var container = document.getElementById(containerId);
                if (container) {{
                    LogitLensWidget("#" + containerId, data, uiState);
                }} else {{
                    setTimeout(initWidget, 10);
                }}
            }}
            initWidget();
        }})();
        </script>
        """
    else:
        # Load from CDN
        cdn_url = _get_widget_url()
        html = f"""
        <div id="{container_id}" style="background: white; padding: 20px; border-radius: 8px;"></div>
        <script>
        (function() {{
            var data = {json.dumps(widget_data)};
            var uiState = {json.dumps(ui_state)};

            // Check if LogitLensWidget is already loaded
            if (typeof LogitLensWidget !== 'undefined') {{
                LogitLensWidget("#{container_id}", data, uiState);
            }} else {{
                // Load widget script from CDN
                var script = document.createElement('script');
                script.src = "{cdn_url}";
                script.onload = function() {{
                    LogitLensWidget("#{container_id}", data, uiState);
                }};
                document.head.appendChild(script);
            }}
        }})();
        </script>
        """

    return HTML(html)


def display_logit_lens(
    data: Dict,
    title: Optional[str] = None,
    **kwargs: Any,
) -> None:
    """
    Display interactive logit lens visualization in Jupyter (convenience function).

    Same as show_logit_lens but calls display() automatically.
    Accepts all the same keyword arguments as show_logit_lens.

    Args:
        data: Data from collect_logit_lens() or to_js_format()
        title: Optional title for the widget
        **kwargs: Additional options passed to show_logit_lens
                  (dark_mode, chart_height, cell_width, pinned_rows, etc.)
    """
    display(show_logit_lens(data, title, **kwargs))
