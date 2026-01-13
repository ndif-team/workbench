"""
Tests for the lens endpoints using local GPT-2.

These tests run with REMOTE=false, using a local GPT-2 model for fast execution.
GPT-2 (124M params) runs well on CPU and fits comfortably in memory.
"""

import pytest


@pytest.mark.asyncio
async def test_lens_v2_full(client, test_headers, gpt2_model):
    """Test the V2 lens endpoint returns valid data with all features enabled."""
    response = await client.post(
        "/lens/start-v2",
        json={
            "model": gpt2_model,
            "prompt": "The quick brown fox",
            "k": 5,
            "include_rank": True,
            "include_entropy": True,
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Check meta
    assert data["meta"]["version"] == 2
    assert data["meta"]["model"] == gpt2_model

    # Check input tokens were parsed correctly
    assert isinstance(data["input"], list)
    assert len(data["input"]) > 0  # Should have some tokens

    # Check layers - GPT-2 has 12 layers
    assert isinstance(data["layers"], list)
    assert len(data["layers"]) == 12

    # Check topk structure: [layer][position][k]
    assert isinstance(data["topk"], list)
    assert len(data["topk"]) == 12  # One per layer
    assert len(data["topk"][0]) == len(data["input"])  # One per position
    assert len(data["topk"][0][0]) == 5  # k=5 top predictions

    # Check tracked structure: [position]{token: {prob, rank}}
    assert isinstance(data["tracked"], list)
    assert len(data["tracked"]) == len(data["input"])

    # Check first position has tracked tokens with prob and rank
    first_pos_tracked = data["tracked"][0]
    assert len(first_pos_tracked) > 0
    for token, trajectory in first_pos_tracked.items():
        assert isinstance(trajectory, dict)
        assert "prob" in trajectory
        assert "rank" in trajectory
        assert len(trajectory["prob"]) == 12  # One per layer
        assert len(trajectory["rank"]) == 12  # One per layer
        # Probabilities should be between 0 and 1
        for p in trajectory["prob"]:
            assert 0 <= p <= 1
        # Ranks should be positive integers
        for r in trajectory["rank"]:
            assert r >= 1

    # Check entropy data is present
    assert "entropy" in data
    assert data["entropy"] is not None
    assert len(data["entropy"]) == 12  # One per layer
    assert len(data["entropy"][0]) == len(data["input"])  # One per position
    # Entropy values should be non-negative
    for layer_entropy in data["entropy"]:
        for e in layer_entropy:
            assert e >= 0


@pytest.mark.asyncio
async def test_lens_v2_without_rank(client, test_headers, gpt2_model):
    """Test V2 endpoint without rank data."""
    response = await client.post(
        "/lens/start-v2",
        json={
            "model": gpt2_model,
            "prompt": "Hello world",
            "k": 3,
            "include_rank": False,
            "include_entropy": False,
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Without rank, tracked should be simple arrays
    first_pos_tracked = data["tracked"][0]
    for token, trajectory in first_pos_tracked.items():
        # Should be a list of probabilities, not a dict
        assert isinstance(trajectory, list)
        assert len(trajectory) == 12  # GPT-2 has 12 layers

    # Entropy should not be present
    assert data.get("entropy") is None


@pytest.mark.asyncio
async def test_lens_v2_with_rank_without_entropy(client, test_headers, gpt2_model):
    """Test V2 endpoint with rank but without entropy data.

    This isolates the entropy flag behavior - rank should work independently.
    """
    response = await client.post(
        "/lens/start-v2",
        json={
            "model": gpt2_model,
            "prompt": "The quick brown fox",
            "k": 5,
            "include_rank": True,
            "include_entropy": False,
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Should have valid structure
    assert data["meta"]["version"] == 2
    assert len(data["layers"]) == 12

    # Tracked should have rank data (since include_rank=True)
    first_pos_tracked = data["tracked"][0]
    for token, trajectory in first_pos_tracked.items():
        assert isinstance(trajectory, dict)
        assert "prob" in trajectory
        assert "rank" in trajectory
        assert len(trajectory["prob"]) == 12
        assert len(trajectory["rank"]) == 12
        # Probabilities should be between 0 and 1
        for p in trajectory["prob"]:
            assert 0 <= p <= 1
        # Ranks should be positive integers
        for r in trajectory["rank"]:
            assert r >= 1

    # Entropy should NOT be present (since include_entropy=False)
    assert data.get("entropy") is None


@pytest.mark.asyncio
async def test_lens_grid_probability(client, test_headers, gpt2_model):
    """Test the grid endpoint with probability statistic."""
    response = await client.post(
        "/lens/start-grid",
        json={
            "model": gpt2_model,
            "prompt": "The cat sat",
            "stat": "probability",
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    # Check data structure
    assert "data" in data
    rows = data["data"]
    assert isinstance(rows, list)
    assert len(rows) > 0  # Should have rows for each input token

    # Check row structure
    for row in rows:
        assert "id" in row  # Token-position id
        assert "data" in row  # List of grid cells
        cells = row["data"]
        assert len(cells) == 12  # One per layer (GPT-2 has 12 layers)

        for cell in cells:
            assert "x" in cell  # Layer index
            assert "y" in cell  # Probability value
            assert "label" in cell  # Predicted token
            assert 0 <= cell["y"] <= 1  # Probability range


@pytest.mark.asyncio
async def test_lens_grid_rank(client, test_headers, gpt2_model):
    """Test the grid endpoint with rank statistic."""
    response = await client.post(
        "/lens/start-grid",
        json={
            "model": gpt2_model,
            "prompt": "Hello",
            "stat": "rank",
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    rows = data["data"]
    assert len(rows) > 0

    # Rank mode should have right_axis_label
    for row in rows:
        assert "right_axis_label" in row
        # y values are log(rank)
        for cell in row["data"]:
            assert "y" in cell
            # Label should be the actual rank as a string
            assert cell["label"].isdigit()


@pytest.mark.asyncio
async def test_lens_grid_entropy(client, test_headers, gpt2_model):
    """Test the grid endpoint with entropy statistic."""
    response = await client.post(
        "/lens/start-grid",
        json={
            "model": gpt2_model,
            "prompt": "Test",
            "stat": "entropy",
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    rows = data["data"]
    assert len(rows) > 0

    for row in rows:
        assert "right_axis_label" in row
        for cell in row["data"]:
            # Entropy should be non-negative
            assert cell["y"] >= 0


@pytest.mark.asyncio
async def test_lens_line_probability(client, test_headers, gpt2_model):
    """Test the line endpoint with probability statistic."""
    response = await client.post(
        "/lens/start-line",
        json={
            "model": gpt2_model,
            "prompt": "The quick",
            "stat": "probability",
            "token": {
                "idx": 1,  # Position of "quick"
                "id": 2068,  # Token ID for "quick"
                "text": "quick",
                "targetIds": [262, 5765],  # Token IDs to track (uses camelCase alias)
            },
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    assert "data" in data
    lines = data["data"]
    assert len(lines) == 2  # Two target tokens

    for line in lines:
        assert "id" in line
        assert "data" in line
        points = line["data"]
        # Should have one point per layer
        assert len(points) == 12  # GPT-2 has 12 layers

        for point in points:
            assert "x" in point  # Layer index
            assert "y" in point  # Probability value
            assert 0 <= point["y"] <= 1


@pytest.mark.asyncio
async def test_lens_line_rank(client, test_headers, gpt2_model):
    """Test the line endpoint with rank statistic."""
    response = await client.post(
        "/lens/start-line",
        json={
            "model": gpt2_model,
            "prompt": "The quick",
            "stat": "rank",
            "token": {
                "idx": 1,
                "id": 2068,
                "text": "quick",
                "targetIds": [262],
            },
        },
        headers=test_headers,
    )

    assert response.status_code == 200
    data = response.json()

    lines = data["data"]
    assert len(lines) == 1

    for line in lines:
        for point in line["data"]:
            # Rank should be a positive integer
            assert point["y"] >= 1


@pytest.mark.asyncio
async def test_missing_auth_header(client, gpt2_model):
    """Test that missing X-User-Email header returns 401."""
    response = await client.post(
        "/lens/start-v2",
        json={
            "model": gpt2_model,
            "prompt": "Test",
        },
        # No headers
    )

    assert response.status_code == 401
    assert "X-User-Email" in response.json()["detail"]


@pytest.mark.asyncio
async def test_models_list(client, test_headers):
    """Test that the models endpoint returns available models."""
    response = await client.get("/models/", headers=test_headers)

    assert response.status_code == 200
    models = response.json()

    assert isinstance(models, list)
    assert len(models) > 0

    # Check GPT-2 is in the list
    model_names = [m["name"] for m in models]
    assert "openai-community/gpt2" in model_names
