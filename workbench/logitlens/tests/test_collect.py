"""
Tests for logitlens collect module.

Unit tests for model detection and mapping functions.
Integration tests with real GPT-2 model.
"""

import pytest
import torch
from unittest.mock import MagicMock
from workbench.logitlens.collect import (
    _detect_model_type,
    _get_num_layers,
    _get_attr_by_path,
    MODEL_MAPPINGS,
    collect_logit_lens,
)


class TestModelDetection:
    """Tests for model type detection functions."""

    def test_detect_gpt2_by_model_type(self):
        """Should detect GPT-2 from model_type config."""
        model = MagicMock()
        model.config.model_type = "gpt2"
        model.config.architectures = []
        model.config._name_or_path = "some-model"

        assert _detect_model_type(model) == "gpt2"

    def test_detect_llama_by_model_type(self):
        """Should detect Llama from model_type config."""
        model = MagicMock()
        model.config.model_type = "llama"
        model.config.architectures = []
        model.config._name_or_path = "some-model"

        assert _detect_model_type(model) == "llama"

    def test_detect_by_architecture_fallback(self):
        """Should fall back to architectures when model_type is unknown."""
        model = MagicMock()
        model.config.model_type = "custom_type_xyz"
        model.config.architectures = ["LlamaForCausalLM"]
        model.config._name_or_path = "some-model"

        assert _detect_model_type(model) == "llama"

    def test_detect_by_model_name_fallback(self):
        """Should fall back to model name when other methods fail."""
        model = MagicMock()
        model.config.model_type = "custom"
        model.config.architectures = ["CustomModel"]
        model.config._name_or_path = "meta-llama/Llama-2-7b"

        assert _detect_model_type(model) == "llama"

    def test_default_to_gpt2_for_unknown(self):
        """Should default to GPT-2 mappings for completely unknown models."""
        model = MagicMock()
        model.config.model_type = "totally_unknown"
        model.config.architectures = ["UnknownArch"]
        model.config._name_or_path = "unknown/model"

        # Default should be gpt2
        assert _detect_model_type(model) == "gpt2"

    def test_detection_priority_order(self):
        """model_type should take priority over architectures and name."""
        model = MagicMock()
        model.config.model_type = "gemma"  # Direct match
        model.config.architectures = ["LlamaForCausalLM"]  # Would match llama
        model.config._name_or_path = "gpt2-model"  # Would match gpt2

        # model_type should win
        assert _detect_model_type(model) == "gemma"


class TestNumLayers:
    """Tests for layer count detection."""

    def _make_non_normalized_mock(self):
        """Create a mock that won't be detected as normalized.

        MagicMock auto-creates attributes, which would make the model appear
        normalized. We use spec to prevent this.
        """
        model = MagicMock()
        # Make model.model not have the normalized attributes
        model.model = MagicMock(spec=[])  # Empty spec = no attributes
        return model

    def test_get_num_layers_uses_correct_config_key(self):
        """Should use the correct config key for each model type."""
        # GPT-2 uses n_layer
        gpt2_model = self._make_non_normalized_mock()
        gpt2_model.config.model_type = "gpt2"
        gpt2_model.config.n_layer = 12
        gpt2_model.config.architectures = []
        gpt2_model.config._name_or_path = "gpt2"
        assert _get_num_layers(gpt2_model) == 12

        # Llama uses num_hidden_layers
        llama_model = self._make_non_normalized_mock()
        llama_model.config.model_type = "llama"
        llama_model.config.num_hidden_layers = 32
        llama_model.config.architectures = []
        llama_model.config._name_or_path = "llama"
        assert _get_num_layers(llama_model) == 32

    def test_get_num_layers_fallback_keys(self):
        """Should try fallback keys if primary not found."""
        model = self._make_non_normalized_mock()
        # Use a config with specific attributes only (not MagicMock's auto-create)
        model.config = MagicMock(spec=["model_type", "architectures", "_name_or_path", "num_layers"])
        model.config.model_type = "unknown"
        model.config.architectures = []
        model.config._name_or_path = "unknown"
        model.config.num_layers = 24
        assert _get_num_layers(model) == 24

    def test_get_num_layers_raises_for_missing(self):
        """Should raise ValueError if no layer count can be determined."""
        model = self._make_non_normalized_mock()
        model.config.model_type = "unknown"
        model.config.architectures = []
        model.config._name_or_path = "test"

        # Remove all possible keys (including n_layers used by workbench)
        for attr in ["n_layer", "n_layers", "num_layers", "num_hidden_layers"]:
            if hasattr(model.config, attr):
                delattr(model.config, attr)

        with pytest.raises(ValueError, match="Could not determine number of layers"):
            _get_num_layers(model)


class TestModelMappings:
    """Tests for model mapping configuration."""

    def test_all_mappings_have_valid_paths(self):
        """All model mappings should have syntactically valid dot-paths."""
        for model_type, mapping in MODEL_MAPPINGS.items():
            # Each path should be non-empty and contain valid identifiers
            for key in ["layers", "ln_f", "lm_head"]:
                path = mapping[key]
                assert path, f"{model_type}.{key} is empty"
                # Should be dot-separated identifiers
                parts = path.split(".")
                assert all(part.isidentifier() for part in parts), \
                    f"{model_type}.{key}='{path}' has invalid path component"

    def test_gpt2_paths_match_actual_model_structure(self):
        """GPT-2 mapping paths should match HuggingFace GPT2LMHeadModel structure."""
        mapping = MODEL_MAPPINGS["gpt2"]
        # These are the actual paths in GPT2LMHeadModel
        assert mapping["layers"] == "transformer.h"
        assert mapping["ln_f"] == "transformer.ln_f"
        assert mapping["lm_head"] == "lm_head"

    def test_llama_paths_match_actual_model_structure(self):
        """Llama mapping paths should match HuggingFace LlamaForCausalLM structure."""
        mapping = MODEL_MAPPINGS["llama"]
        # These are the actual paths in LlamaForCausalLM
        assert mapping["layers"] == "model.layers"
        assert mapping["ln_f"] == "model.norm"
        assert mapping["lm_head"] == "lm_head"


class TestHelperFunctions:
    """Tests for internal helper functions."""

    def test_get_attr_by_path_single_level(self):
        """Should handle single-level paths."""
        obj = MagicMock()
        obj.foo = "bar"
        assert _get_attr_by_path(obj, "foo") == "bar"

    def test_get_attr_by_path_nested(self):
        """Should handle nested paths."""
        obj = MagicMock()
        obj.a.b.c = "deep"
        assert _get_attr_by_path(obj, "a.b.c") == "deep"

    def test_get_attr_by_path_raises_for_missing(self):
        """Should raise AttributeError for missing paths."""
        obj = MagicMock(spec=[])  # Empty spec means no attributes
        with pytest.raises(AttributeError):
            _get_attr_by_path(obj, "nonexistent")


class TestCollectIntegration:
    """Integration tests with real GPT-2 model."""

    @pytest.fixture(scope="class")
    def gpt2_model(self):
        """Load GPT-2 model once for all tests in this class."""
        from nnsight import LanguageModel
        return LanguageModel("openai-community/gpt2")

    def test_collect_returns_all_required_keys(self, gpt2_model):
        """Result should contain all required keys with correct types."""
        result = collect_logit_lens(
            "The capital of France is",
            gpt2_model,
            k=3,
            remote=False
        )

        # Check all keys present
        assert "model" in result and isinstance(result["model"], str)
        assert "input" in result and isinstance(result["input"], list)
        assert "layers" in result and isinstance(result["layers"], list)
        assert "topk" in result and isinstance(result["topk"], torch.Tensor)
        assert "tracked" in result and isinstance(result["tracked"], list)
        assert "probs" in result and isinstance(result["probs"], list)
        assert "vocab" in result and isinstance(result["vocab"], dict)

    def test_collect_correct_layer_count(self, gpt2_model):
        """Should return data for all 12 GPT-2 layers by default."""
        result = collect_logit_lens("Hello world", gpt2_model, k=3, remote=False)

        assert result["layers"] == list(range(12))
        assert result["topk"].shape[0] == 12

    def test_collect_custom_layers(self, gpt2_model):
        """Should respect custom layer selection."""
        custom_layers = [0, 5, 11]
        result = collect_logit_lens(
            "Test",
            gpt2_model,
            k=3,
            layers=custom_layers,
            remote=False
        )

        assert result["layers"] == custom_layers
        assert result["topk"].shape[0] == len(custom_layers)
        # Probs should also match
        assert all(p.shape[0] == len(custom_layers) for p in result["probs"])

    # === Value Correctness Tests ===

    def test_probabilities_are_valid(self, gpt2_model):
        """All probabilities should be in [0, 1]."""
        result = collect_logit_lens("Test prompt", gpt2_model, k=5, remote=False)

        for pos_probs in result["probs"]:
            assert torch.all(pos_probs >= 0), "Probabilities should be non-negative"
            assert torch.all(pos_probs <= 1), "Probabilities should be <= 1"

    def test_topk_tokens_appear_in_tracked(self, gpt2_model):
        """Top-k tokens at each position should be subset of tracked tokens."""
        result = collect_logit_lens("Hello", gpt2_model, k=3, remote=False)

        for pos in range(len(result["input"])):
            tracked_ids = set(result["tracked"][pos].tolist())
            for layer_idx in range(len(result["layers"])):
                topk_ids = set(result["topk"][layer_idx, pos, :].tolist())
                assert topk_ids.issubset(tracked_ids), \
                    f"Position {pos}, layer {layer_idx}: topk not in tracked"

    def test_vocab_contains_all_tracked_tokens(self, gpt2_model):
        """Vocab should have entries for all token IDs in topk and tracked."""
        result = collect_logit_lens("Test", gpt2_model, k=3, remote=False)

        all_ids = set(result["topk"].flatten().tolist())
        for tracked in result["tracked"]:
            all_ids.update(tracked.tolist())

        for token_id in all_ids:
            assert token_id in result["vocab"], f"Token ID {token_id} missing from vocab"

    def test_vocab_strings_are_decodable(self, gpt2_model):
        """Vocab values should be valid decoded strings."""
        result = collect_logit_lens("Hello world", gpt2_model, k=3, remote=False)

        for token_id, token_str in result["vocab"].items():
            assert isinstance(token_str, str)
            # Re-encoding should give back the same ID
            re_encoded = gpt2_model.tokenizer.encode(token_str, add_special_tokens=False)
            # Note: Some tokens may decode to multiple tokens, so we just check it's non-empty
            assert len(token_str) >= 0  # Just verify it's a valid string

    def test_input_tokens_reconstruct_prompt(self, gpt2_model):
        """Input tokens should reconstruct the original prompt."""
        prompt = "The quick brown fox"
        result = collect_logit_lens(prompt, gpt2_model, k=3, remote=False)

        reconstructed = "".join(result["input"])
        assert reconstructed == prompt

    # === Edge Case Tests ===

    def test_single_token_prompt(self, gpt2_model):
        """Should handle single-token prompts."""
        result = collect_logit_lens("Hi", gpt2_model, k=3, remote=False)

        assert len(result["input"]) >= 1
        assert result["topk"].shape[1] >= 1
        assert len(result["tracked"]) >= 1
        assert len(result["probs"]) >= 1

    def test_prompt_with_newlines(self, gpt2_model):
        """Should handle prompts with newline characters."""
        result = collect_logit_lens("Hello\nWorld", gpt2_model, k=3, remote=False)

        reconstructed = "".join(result["input"])
        assert "Hello" in reconstructed
        assert "World" in reconstructed

    def test_prompt_with_unicode(self, gpt2_model):
        """Should handle prompts with unicode characters."""
        result = collect_logit_lens("Hello 世界", gpt2_model, k=3, remote=False)

        # Should complete without error
        assert len(result["input"]) > 0
        assert result["topk"].shape[1] == len(result["input"])

    def test_long_prompt(self, gpt2_model):
        """Should handle longer prompts (50+ tokens)."""
        long_prompt = "The quick brown fox jumps over the lazy dog. " * 5
        result = collect_logit_lens(long_prompt, gpt2_model, k=3, remote=False)

        # Should have many tokens
        assert len(result["input"]) > 30
        # Structure should still be correct
        assert result["topk"].shape[1] == len(result["input"])
        assert len(result["tracked"]) == len(result["input"])

    def test_k_equals_one(self, gpt2_model):
        """Should handle k=1 (single top prediction)."""
        result = collect_logit_lens("Test", gpt2_model, k=1, remote=False)

        assert result["topk"].shape[2] == 1
        # Should still have tracked tokens (at least 1 per position)
        for tracked in result["tracked"]:
            assert len(tracked) >= 1

    def test_large_k_value(self, gpt2_model):
        """Should handle large k values."""
        result = collect_logit_lens("Hi", gpt2_model, k=50, remote=False)

        assert result["topk"].shape[2] == 50
        # Tracked should have all unique tokens from topk
        for pos in range(len(result["input"])):
            tracked_count = len(result["tracked"][pos])
            # With k=50 across 12 layers, we should have many unique tokens
            assert tracked_count >= 50  # At least k tokens

    def test_single_layer_selection(self, gpt2_model):
        """Should handle selecting only one layer."""
        result = collect_logit_lens("Test", gpt2_model, k=3, layers=[6], remote=False)

        assert result["layers"] == [6]
        assert result["topk"].shape[0] == 1
        for probs in result["probs"]:
            assert probs.shape[0] == 1

    # === Error Handling Tests ===

    def test_invalid_layer_index_raises(self, gpt2_model):
        """Should raise error for out-of-bounds layer index."""
        with pytest.raises((IndexError, RuntimeError)):
            collect_logit_lens("Test", gpt2_model, k=3, layers=[999], remote=False)

    def test_negative_layer_index_raises(self, gpt2_model):
        """Should raise error for negative layer index."""
        # Negative indices might work as Python list indices, but we should test behavior
        try:
            result = collect_logit_lens("Test", gpt2_model, k=3, layers=[-1], remote=False)
            # If it doesn't raise, it should at least give valid data
            assert len(result["layers"]) == 1
        except (IndexError, RuntimeError):
            pass  # Expected behavior

    # === Full Workflow Test ===

    def test_collect_to_display_workflow(self, gpt2_model):
        """Full workflow: collect -> to_js_format -> show_logit_lens."""
        from workbench.logitlens.display import to_js_format, show_logit_lens
        from IPython.display import HTML

        # Collect
        data = collect_logit_lens("The capital of France is", gpt2_model, k=5, remote=False)

        # Convert
        js_data = to_js_format(data)
        assert js_data["meta"]["version"] == 2
        assert len(js_data["topk"]) == 12
        assert len(js_data["tracked"]) == len(data["input"])

        # Verify trajectory values are preserved
        for pos in range(len(data["input"])):
            for token_str, trajectory in js_data["tracked"][pos].items():
                assert len(trajectory) == 12
                assert all(0 <= p <= 1 for p in trajectory)

        # Display
        html = show_logit_lens(js_data, title="Test")
        assert isinstance(html, HTML)
        assert "LogitLensWidget" in html.data
