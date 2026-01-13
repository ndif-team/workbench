"""
Pytest configuration for backend tests.

Uses local GPT-2 with REMOTE=false for fast testing without NDIF.
"""

import os
import pytest
from httpx import ASGITransport, AsyncClient

# Set environment variables before importing app
os.environ["REMOTE"] = "false"
os.environ["ENVIRONMENT"] = "test"


@pytest.fixture(scope="session")
def app():
    """Create the FastAPI app once per test session."""
    from workbench._api.main import fastapi_app
    return fastapi_app()


@pytest.fixture
async def client(app):
    """Create an async test client for the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_headers():
    """Common headers for authenticated requests."""
    return {"X-User-Email": "test@localhost"}


@pytest.fixture
def gpt2_model():
    """Return the GPT-2 model name for tests."""
    return "openai-community/gpt2"
