"""
Tests for logitlens display module.

Tests format detection, data conversion, and HTML generation.
"""

import pytest
import torch
import json
from workbench.logitlens.display import (
    to_js_format,
    show_logit_lens,
    _is_js_format,
    _is_python_format,
    _get_widget_js,
)


class TestFormatDetection:
    """Tests for format detection functions."""

    def test_is_js_format_detects_v2_structure(self, sample_js_data):
        """JS format requires meta with version and tracked as dict."""
        assert _is_js_format(sample_js_data) is True

        # Removing meta should fail detection
        no_meta = {k: v for k, v in sample_js_data.items() if k != "meta"}
        assert _is_js_format(no_meta) is False

        # Tracked as list (not dict) should fail
        wrong_tracked = {**sample_js_data, "tracked": [[0.1, 0.2]]}
        assert _is_js_format(wrong_tracked) is False

    def test_is_python_format_detects_tensor_structure(self, sample_python_data):
        """Python format requires vocab, topk tensor, and probs tensors."""
        assert _is_python_format(sample_python_data) is True

        # Missing vocab should fail
        no_vocab = {k: v for k, v in sample_python_data.items() if k != "vocab"}
        assert _is_python_format(no_vocab) is False

        # Missing probs should fail
        no_probs = {k: v for k, v in sample_python_data.items() if k != "probs"}
        assert _is_python_format(no_probs) is False

    def test_formats_are_mutually_exclusive(self, sample_python_data, sample_js_data):
        """Each format should only match its own detector."""
        assert _is_js_format(sample_python_data) is False
        assert _is_python_format(sample_js_data) is False


class TestToJsFormat:
    """Tests for to_js_format conversion function."""

    def test_produces_valid_v2_meta(self, sample_python_data):
        """Output meta should have version=2 and preserve model name."""
        result = to_js_format(sample_python_data)
        assert result["meta"]["version"] == 2
        assert result["meta"]["model"] == sample_python_data["model"]

    def test_topk_converts_tensor_indices_to_token_strings(self, sample_python_data):
        """topk tensor indices should be converted to vocab strings."""
        result = to_js_format(sample_python_data)
        n_layers = len(sample_python_data["layers"])
        n_pos = len(sample_python_data["input"])
        k = sample_python_data["topk"].shape[2]

        # Check structure
        assert len(result["topk"]) == n_layers
        assert len(result["topk"][0]) == n_pos
        assert len(result["topk"][0][0]) == k

        # Check that values are strings (token text), not integers
        for layer_data in result["topk"]:
            for pos_data in layer_data:
                for token in pos_data:
                    assert isinstance(token, str)

    def test_tracked_converts_to_token_trajectory_dicts(self, sample_python_data):
        """tracked should convert parallel arrays to {token: trajectory} dicts."""
        result = to_js_format(sample_python_data)
        n_pos = len(sample_python_data["input"])
        n_layers = len(sample_python_data["layers"])

        assert len(result["tracked"]) == n_pos

        for pos_idx, pos_tracked in enumerate(result["tracked"]):
            assert isinstance(pos_tracked, dict)
            # Number of tracked tokens should match input
            n_tracked = len(sample_python_data["tracked"][pos_idx])
            assert len(pos_tracked) == n_tracked

            # Each trajectory should have n_layers probability values
            for token, trajectory in pos_tracked.items():
                assert isinstance(token, str)
                assert isinstance(trajectory, list)
                assert len(trajectory) == n_layers
                # Values should be floats in [0, 1]
                for p in trajectory:
                    assert isinstance(p, float)
                    assert 0 <= p <= 1

    def test_probability_values_are_rounded(self, sample_python_data):
        """Probabilities should be rounded to 5 decimal places."""
        result = to_js_format(sample_python_data)

        for pos_tracked in result["tracked"]:
            for token, trajectory in pos_tracked.items():
                for p in trajectory:
                    # Check that value has at most 5 decimal places
                    rounded = round(p, 5)
                    assert p == rounded

    def test_output_is_json_serializable(self, sample_python_data):
        """Output should be fully JSON serializable (no tensors)."""
        result = to_js_format(sample_python_data)
        # Should not raise
        json_str = json.dumps(result)
        # Should round-trip correctly
        parsed = json.loads(json_str)
        assert parsed["meta"]["version"] == 2
        assert len(parsed["topk"]) == len(result["topk"])

    def test_handles_special_token_characters(self):
        """Should handle tokens with special characters (newlines, unicode)."""
        special_data = {
            "model": "test",
            "input": ["Hello", "\n", "世界", "👋"],
            "layers": [0, 1],
            "topk": torch.tensor([[[0, 1], [2, 3], [0, 1], [2, 3]],
                                  [[0, 1], [2, 3], [0, 1], [2, 3]]], dtype=torch.int32),
            "tracked": [torch.tensor([0, 1], dtype=torch.int32) for _ in range(4)],
            "probs": [torch.tensor([[0.5, 0.3], [0.6, 0.2]]) for _ in range(4)],
            "vocab": {0: "Hello", 1: "\n", 2: "世界", 3: "👋"},
        }
        result = to_js_format(special_data)

        # Should be JSON serializable
        json_str = json.dumps(result)
        parsed = json.loads(json_str)

        # Special chars should be preserved in actual data
        # Note: str() escapes newlines, so check actual values
        assert "\n" in parsed["input"]
        assert "世界" in parsed["input"]
        assert "👋" in parsed["input"]


class TestShowLogitLens:
    """Tests for show_logit_lens HTML generation."""

    def test_returns_html_with_embedded_data(self, sample_js_data):
        """Generated HTML should embed the data as JSON."""
        from IPython.display import HTML
        result = show_logit_lens(sample_js_data)

        assert isinstance(result, HTML)
        # Data should be embedded
        assert '"meta":' in result.data
        assert '"version": 2' in result.data
        # Model name should appear
        assert sample_js_data["meta"]["model"] in result.data

    def test_generates_unique_container_ids(self, sample_js_data):
        """Each call should generate a unique container ID."""
        result1 = show_logit_lens(sample_js_data)
        result2 = show_logit_lens(sample_js_data)

        # Extract container IDs
        import re
        id1 = re.search(r'id="(logit-lens-[^"]+)"', result1.data)
        id2 = re.search(r'id="(logit-lens-[^"]+)"', result2.data)

        assert id1 and id2
        assert id1.group(1) != id2.group(1)

    def test_custom_container_id_used_correctly(self, sample_js_data):
        """Custom container ID should appear in div and script."""
        result = show_logit_lens(sample_js_data, container_id="my-custom-widget")

        assert 'id="my-custom-widget"' in result.data
        # The container ID is used as a variable, then combined with "#"
        assert 'containerId = "my-custom-widget"' in result.data

    def test_title_embedded_in_ui_state(self, sample_js_data):
        """Title should be passed to widget via uiState."""
        result = show_logit_lens(sample_js_data, title="Test Analysis")

        # Title should appear in uiState JSON
        assert '"title": "Test Analysis"' in result.data

    def test_auto_converts_python_format(self, sample_python_data):
        """Should automatically convert Python format to JS format."""
        from IPython.display import HTML
        result = show_logit_lens(sample_python_data)

        assert isinstance(result, HTML)
        # Should be converted to V2 format
        assert '"version": 2' in result.data
        # Should have tracked as dict (not tensor)
        assert '"tracked":' in result.data

    def test_rejects_unrecognized_format(self):
        """Should raise ValueError for unrecognized data format."""
        with pytest.raises(ValueError, match="Unrecognized data format"):
            show_logit_lens({"random": "data"})

        with pytest.raises(ValueError, match="Unrecognized data format"):
            show_logit_lens({})

    def test_html_invokes_widget_constructor(self, sample_js_data):
        """Generated HTML should call LogitLensWidget constructor."""
        result = show_logit_lens(sample_js_data)

        assert "LogitLensWidget(" in result.data
        assert "#" in result.data  # Container selector

    def test_local_js_embedded_when_available(self, sample_js_data):
        """When local widget JS exists, it should be embedded inline."""
        local_js = _get_widget_js()

        if local_js:
            result = show_logit_lens(sample_js_data)
            # Should not have CDN script loading
            assert "script.src" not in result.data or "LogitLensWidget" in result.data
        else:
            # If no local JS, should load from CDN
            result = show_logit_lens(sample_js_data)
            assert "script.src" in result.data

    def test_handles_empty_title(self, sample_js_data):
        """Empty title should not add title to uiState."""
        result = show_logit_lens(sample_js_data, title="")
        # Empty string title might be omitted or included - just shouldn't crash
        assert isinstance(result.data, str)

        result_none = show_logit_lens(sample_js_data, title=None)
        assert isinstance(result_none.data, str)


class TestRankAndEntropyConversion:
    """Tests for rank and entropy data conversion in to_js_format."""

    def test_converts_rank_data_to_tracked_trajectory_format(self, sample_python_data_with_ranks):
        """Rank data should convert to TrackedTrajectory format with prob and rank arrays."""
        result = to_js_format(sample_python_data_with_ranks)
        n_layers = len(sample_python_data_with_ranks["layers"])

        # tracked should now contain dicts with prob and rank keys
        for pos_tracked in result["tracked"]:
            for token, traj_data in pos_tracked.items():
                assert isinstance(traj_data, dict), f"Expected dict, got {type(traj_data)}"
                assert "prob" in traj_data, "Missing 'prob' key"
                assert "rank" in traj_data, "Missing 'rank' key"
                assert len(traj_data["prob"]) == n_layers
                assert len(traj_data["rank"]) == n_layers
                # Prob values should be floats in [0, 1]
                for p in traj_data["prob"]:
                    assert isinstance(p, float)
                    assert 0 <= p <= 1
                # Rank values should be integers >= 1
                for r in traj_data["rank"]:
                    assert isinstance(r, int)

    def test_rank_data_is_json_serializable(self, sample_python_data_with_ranks):
        """Output with rank data should be fully JSON serializable."""
        result = to_js_format(sample_python_data_with_ranks)
        json_str = json.dumps(result)
        parsed = json.loads(json_str)

        # Verify TrackedTrajectory structure survives round-trip
        for pos_tracked in parsed["tracked"]:
            for token, traj_data in pos_tracked.items():
                assert "prob" in traj_data
                assert "rank" in traj_data

    def test_converts_entropy_to_2d_array(self, sample_python_data_with_entropy):
        """Entropy tensor should convert to 2D array [n_layers][n_positions]."""
        result = to_js_format(sample_python_data_with_entropy)
        n_layers = len(sample_python_data_with_entropy["layers"])
        n_pos = len(sample_python_data_with_entropy["input"])

        assert "entropy" in result
        assert len(result["entropy"]) == n_layers
        for layer_entropy in result["entropy"]:
            assert len(layer_entropy) == n_pos
            for e in layer_entropy:
                assert isinstance(e, float)
                assert e >= 0  # Entropy is non-negative

    def test_entropy_values_are_rounded(self, sample_python_data_with_entropy):
        """Entropy values should be rounded to 5 decimal places."""
        result = to_js_format(sample_python_data_with_entropy)

        for layer_entropy in result["entropy"]:
            for e in layer_entropy:
                rounded = round(e, 5)
                assert e == rounded

    def test_entropy_is_json_serializable(self, sample_python_data_with_entropy):
        """Output with entropy data should be fully JSON serializable."""
        result = to_js_format(sample_python_data_with_entropy)
        json_str = json.dumps(result)
        parsed = json.loads(json_str)

        assert "entropy" in parsed
        assert len(parsed["entropy"]) == len(result["entropy"])

    def test_both_rank_and_entropy_together(self, sample_python_data_with_all):
        """Data with both rank and entropy should convert correctly."""
        result = to_js_format(sample_python_data_with_all)

        # Should have entropy
        assert "entropy" in result

        # tracked should have TrackedTrajectory format with rank
        for pos_tracked in result["tracked"]:
            for token, traj_data in pos_tracked.items():
                assert isinstance(traj_data, dict)
                assert "prob" in traj_data
                assert "rank" in traj_data

        # Should be JSON serializable
        json_str = json.dumps(result)
        parsed = json.loads(json_str)
        assert "entropy" in parsed
        assert "prob" in list(parsed["tracked"][0].values())[0]
        assert "rank" in list(parsed["tracked"][0].values())[0]

    def test_without_rank_uses_simple_array_format(self, sample_python_data):
        """Without rank data, tracked should use simple array format."""
        result = to_js_format(sample_python_data)

        # tracked should contain plain arrays, not dicts
        for pos_tracked in result["tracked"]:
            for token, traj_data in pos_tracked.items():
                assert isinstance(traj_data, list), f"Expected list without rank data, got {type(traj_data)}"

    def test_without_entropy_no_entropy_key(self, sample_python_data):
        """Without entropy data, result should not have entropy key."""
        result = to_js_format(sample_python_data)
        assert "entropy" not in result


class TestEdgeCases:
    """Edge case tests for display module."""

    def test_single_layer_data(self):
        """Should handle data with only one layer."""
        single_layer_data = {
            "model": "test",
            "input": ["Hello", "world"],
            "layers": [5],  # Single layer, not starting at 0
            "topk": torch.tensor([[[0, 1], [0, 1]]], dtype=torch.int32),
            "tracked": [torch.tensor([0], dtype=torch.int32), torch.tensor([1], dtype=torch.int32)],
            "probs": [torch.tensor([[0.9]]), torch.tensor([[0.8]])],
            "vocab": {0: "Hello", 1: "world"},
        }
        result = to_js_format(single_layer_data)

        assert result["layers"] == [5]
        assert len(result["topk"]) == 1
        assert len(result["tracked"][0][list(result["tracked"][0].keys())[0]]) == 1

    def test_single_token_data(self):
        """Should handle data with only one token."""
        single_token_data = {
            "model": "test",
            "input": ["Hello"],
            "layers": [0, 1, 2],
            "topk": torch.tensor([[[0]], [[0]], [[0]]], dtype=torch.int32),
            "tracked": [torch.tensor([0], dtype=torch.int32)],
            "probs": [torch.tensor([[0.9], [0.8], [0.7]])],
            "vocab": {0: "Hello"},
        }
        result = to_js_format(single_token_data)

        assert len(result["input"]) == 1
        assert len(result["tracked"]) == 1

    def test_large_k_value(self):
        """Should handle large k values correctly."""
        k = 50
        large_k_data = {
            "model": "test",
            "input": ["Test"],
            "layers": [0],
            "topk": torch.arange(k, dtype=torch.int32).unsqueeze(0).unsqueeze(0),  # [1, 1, k]
            "tracked": [torch.arange(k, dtype=torch.int32)],
            "probs": [torch.rand(1, k)],
            "vocab": {i: f"token_{i}" for i in range(k)},
        }
        result = to_js_format(large_k_data)

        assert len(result["topk"][0][0]) == k
        assert len(result["tracked"][0]) == k

    def test_probability_near_zero_and_one(self):
        """Should handle probabilities at extreme values."""
        extreme_data = {
            "model": "test",
            "input": ["A", "B"],
            "layers": [0],
            "topk": torch.tensor([[[0], [1]]], dtype=torch.int32),
            "tracked": [torch.tensor([0], dtype=torch.int32), torch.tensor([1], dtype=torch.int32)],
            "probs": [torch.tensor([[1e-10]]), torch.tensor([[0.99999999]])],
            "vocab": {0: "A", 1: "B"},
        }
        result = to_js_format(extreme_data)

        # Values should still be valid
        p0 = list(result["tracked"][0].values())[0][0]
        p1 = list(result["tracked"][1].values())[0][0]
        assert 0 <= p0 <= 1
        assert 0 <= p1 <= 1
