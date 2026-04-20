"""Server-Sent Events helpers shared by workbench SSE routes.

Each SSE route emits a sequence of `status` events during execution followed
by a single terminal event:
    - `data`  — the formatted payload, JSON-encoded
    - `error` — a JSON object with an `error` string

The helpers here keep the three routes that use :class:`StreamingRemoteBackend`
consistent without duplicating the generator boilerplate.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Awaitable, Callable, Union

from nnsight.schema.response import ResponseModel
from pydantic import BaseModel

from .streaming_backend import StreamingRemoteBackend

MEDIA_TYPE = "text/event-stream"

ProcessFn = Callable[[dict], Union[BaseModel, dict, list, Awaitable[Any]]]


def sse_event(event: str, data: str) -> str:
    """Format a single Server-Sent Events frame."""
    return f"event: {event}\ndata: {data}\n\n"


def _jsonify(payload: Any) -> str:
    """JSON-encode a Pydantic model, list-of-models, or plain JSON-compatible value."""
    if isinstance(payload, BaseModel):
        return payload.model_dump_json()
    if isinstance(payload, list) and payload and isinstance(payload[0], BaseModel):
        return json.dumps([p.model_dump() for p in payload])
    return json.dumps(payload)


async def stream_backend(
    backend: StreamingRemoteBackend,
    process: ProcessFn,
) -> AsyncIterator[str]:
    """Iterate a streaming backend and yield SSE frames.

    Forwards every non-terminal :class:`ResponseModel` as a `status` frame,
    calls ``process`` on the downloaded dict when ``COMPLETED`` arrives, and
    emits a terminal `data` frame with the JSON-encoded result. Any exception
    is caught and emitted as an `error` frame so the stream closes cleanly.
    """
    try:
        async for response in backend:
            if response.status == ResponseModel.JobStatus.COMPLETED:
                result = process(response.data)
                if hasattr(result, "__await__"):
                    result = await result  # type: ignore[misc]
                yield sse_event("data", _jsonify(result))
            else:
                yield sse_event("status", response.model_dump_json(exclude={"data"}))
    except Exception as e:
        yield sse_event("error", json.dumps({"error": str(e)}))


async def stream_value(value: Any) -> AsyncIterator[str]:
    """Single-event stream for local (non-remote) endpoints."""
    yield sse_event("data", _jsonify(value))


async def stream_error(message: str) -> AsyncIterator[str]:
    """Single-event stream emitting a single `error` frame."""
    yield sse_event("error", json.dumps({"error": message}))
