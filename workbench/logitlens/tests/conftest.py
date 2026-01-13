"""
Pytest configuration for logitlens module tests.

Tests the display module with mock data (no model or server needed).
"""

import pytest
import torch


@pytest.fixture
def sample_python_data():
    """Sample data in Python format (as returned by collect_logit_lens)."""
    # Generate deterministic random data
    topk = torch.randint(0, 1000, (12, 5, 5), dtype=torch.int32)

    # For tracked, use unique IDs per position to avoid key collisions when
    # converting to dict (where duplicate tokens map to same key)
    tracked = []
    base_id = 1000  # Start after topk range to ensure uniqueness
    for pos_idx in range(5):
        # Each position gets unique token IDs
        pos_ids = torch.arange(base_id + pos_idx * 10, base_id + pos_idx * 10 + 10, dtype=torch.int32)
        tracked.append(pos_ids)

    # Build vocab that includes all token IDs that appear in topk and tracked
    all_ids = set(topk.flatten().tolist())
    for t in tracked:
        all_ids.update(t.tolist())
    vocab = {i: f"token_{i}" for i in all_ids}

    return {
        "model": "openai-community/gpt2",
        "input": ["The", " capital", " of", " France", " is"],
        "layers": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        "topk": topk,
        "tracked": tracked,
        "probs": [torch.rand(12, 10) for _ in range(5)],
        "vocab": vocab,
    }


@pytest.fixture
def sample_js_data():
    """Sample data in JavaScript V2 format."""
    return {
        "meta": {"version": 2, "model": "openai-community/gpt2"},
        "input": ["The", " capital", " of", " France", " is"],
        "layers": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        "topk": [
            [[" Paris", " city", " France"] for _ in range(5)]
            for _ in range(12)
        ],
        "tracked": [
            {" Paris": [0.1] * 12, " city": [0.05] * 12}
            for _ in range(5)
        ],
    }


@pytest.fixture
def sample_python_data_with_ranks(sample_python_data):
    """Sample data in Python format with rank data (include_rank=True)."""
    data = dict(sample_python_data)
    # Add ranks: [n_layers, n_tracked] per position, values are rankings (1-based)
    data["ranks"] = [
        torch.randint(1, 1000, (12, 10), dtype=torch.int32) for _ in range(5)
    ]
    return data


@pytest.fixture
def sample_python_data_with_entropy(sample_python_data):
    """Sample data in Python format with entropy data (include_entropy=True)."""
    data = dict(sample_python_data)
    # Add entropy: [n_layers, n_positions]
    data["entropy"] = torch.rand(12, 5) * 10  # Entropy values typically 0-10
    return data


@pytest.fixture
def sample_python_data_with_all(sample_python_data):
    """Sample data with both rank and entropy data."""
    data = dict(sample_python_data)
    data["ranks"] = [
        torch.randint(1, 1000, (12, 10), dtype=torch.int32) for _ in range(5)
    ]
    data["entropy"] = torch.rand(12, 5) * 10
    return data
