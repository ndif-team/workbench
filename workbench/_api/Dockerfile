# syntax=docker/dockerfile:1.7
# Image for the FastAPI backend behind PR preview deployments.
# Build context must be the repo root (Dockerfile path is workbench/_api/Dockerfile)
# so pyproject.toml + uv.lock + the workbench package are reachable.

FROM python:3.12-slim AS builder
ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv

COPY --from=ghcr.io/astral-sh/uv:0.5.4 /uv /usr/local/bin/uv

# git is needed by uv to resolve the git+https nnsightful source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps in a separate layer from the project code so PR-only code
# changes don't redo a 500MB torch install.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

COPY workbench ./workbench
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12-slim AS runner
ENV PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    HOME=/home/api \
    HF_HOME=/home/api/.cache/huggingface
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 1001 api \
 && mkdir -p /home/api/.cache && chown -R api:api /home/api
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder --chown=api:api /app /app
# nnsight persists its config to a yaml next to the installed module on
# first import (set_default_api_key → save). Make that writable for the
# non-root runtime user.
RUN chown -R api:api /opt/venv/lib/python3.12/site-packages/nnsight
USER api
EXPOSE 8000
# uvicorn directly (no --reload) so the container is one process and
# k8s liveness probes are deterministic.
CMD ["uvicorn", "workbench._api.main:app", "--host", "0.0.0.0", "--port", "8000"]
