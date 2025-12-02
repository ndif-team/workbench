import pytest

def pytest_addoption(parser):
    parser.addoption(
        "--remote",
        action="store_true",          # flag (True/False)
        default=True,
        help="Poll NDIF for job response",
    )

@pytest.fixture
def remote(request) -> bool:
    return request.config.getoption("--remote")