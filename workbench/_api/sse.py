"""Server-Sent Events helpers shared by the tool routes.

Every model-touching route is one POST that stays open: the browser gets each
NDIF status update as it lands and then the finished payload, over a single
connection. That replaces a three-legged flow — POST /start for a job id, poll
NDIF directly until COMPLETED, POST /results/{job_id} — and with it the browser's
need to reach NDIF at all. NDIF is now only ever spoken to from this process.

The event vocabulary is small and every route emits the same one:

    status  a raw nnsight ResponseModel, minus `data` (RECEIVED, QUEUED, RUNNING…)
    data    the finished payload, JSON-encoded. Exactly one, and it ends the stream
    error   {"error": "..."}. Also terminal

Once the stream is open a failure has to be an `error` frame rather than an HTTP
status, because the headers went out when the stream opened and the status line
is long gone. A route may still fail the ordinary way *before* it starts
streaming — a 403 for a model the caller cannot use is still a 403 — and the
client handles both; what it must never see is a request that returns 200 and
then goes quiet.

Local execution (``REMOTE=false``) is streamed too, as a single `data` frame. It
has nothing to report, but giving it the same shape keeps the development mode
off its own path through the UI.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Callable

from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from nnsight.schema.response import ResponseModel, Status

MEDIA_TYPE = "text/event-stream"

# Given the dict of saved values NDIF returns, produce what the client should
# get. Called on the event loop, so it must not block for long -- every one of
# these is arithmetic over tensors that are already in memory.
ProcessFn = Callable[[dict], Any]

# Sent to whatever sits in front of this app. SSE only works if nothing between
# here and the browser buffers the response: nginx (and the ingress in front of
# the preview deployments) buffers proxied responses by default, which holds
# every frame until the stream closes and turns live status into one burst at
# the end.
HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


def sse_event(event: str, data: str) -> str:
    """Format one SSE frame."""
    return f"event: {event}\ndata: {data}\n\n"


def _jsonify(payload: Any) -> str:
    """JSON-encode a payload that may be, or contain, pydantic models.

    ``jsonable_encoder`` is what FastAPI applied itself when these routes still
    declared a ``response_model``; a frame is written by hand now, so it has to be
    applied here. Not just ``model_dump_json`` on the top level: a payload is
    often a plain dict or list with models *inside* it — a generation's
    ``completion`` is a list of ``Token`` — which plain ``json.dumps`` refuses.
    """
    return json.dumps(jsonable_encoder(payload))


# How long a stream may go quiet before it sends a comment frame.
#
# A job can sit QUEUED behind someone else's for minutes, or spend them loading a
# cold 70B, without NDIF having anything new to say — and an idle connection is
# exactly what a proxy reaps. Well under the usual 60s idle timeouts.
HEARTBEAT_SECONDS = 15.0


async def _with_heartbeat(frames: AsyncIterator[str]) -> AsyncIterator[str]:
    """Pass frames through, filling any silence with SSE comments.

    A comment (a frame starting ``:``) is defined to be ignored by every SSE
    client, so this is invisible to the browser and to `runAndStream`; all it does
    is keep bytes moving so nothing in between decides the connection is dead.
    """
    iterator = frames.__aiter__()
    pending = asyncio.ensure_future(iterator.__anext__())
    try:
        while True:
            try:
                # Shielded: a timeout must not cancel the receive we are waiting
                # on, only stop waiting on it for now.
                yield await asyncio.wait_for(
                    asyncio.shield(pending), HEARTBEAT_SECONDS
                )
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"
                continue
            except StopAsyncIteration:
                return
            pending = asyncio.ensure_future(iterator.__anext__())
    finally:
        # The client hung up (or we are done): stop waiting on the socket.
        pending.cancel()


def stream_backend(backend, process: ProcessFn) -> AsyncIterator[str]:
    """Drive an ``AsyncRemoteBackend`` and yield SSE frames for what it reports.

    nnsight's async backend yields raw ``ResponseModel`` updates and then, once the
    job completes, the downloaded dict of saved values as its final item — so the
    type of the yielded object, not a status check, is what says "this is the
    result". Deliberately the *raw* stream: it neither renders nnsight's terminal
    display nor raises on a server-side error, which is what lets an ERROR become
    an `error` frame here rather than a traceback out of a half-written response.

    ``process`` shapes the saved values into the payload the client wants — for a
    tool, that is its ``to_data_obj``.
    """
    return _with_heartbeat(_backend_frames(backend, process))


async def _backend_frames(backend, process: ProcessFn) -> AsyncIterator[str]:
    try:
        failure = None

        async for update in backend:
            if isinstance(update, ResponseModel):
                # Forward the status as-is. `data` is dropped: on COMPLETED it is
                # the object-store URL, which is this process's business and often
                # signed for a host the browser cannot reach anyway.
                if update.status == Status.ERROR:
                    failure = update.description
                yield sse_event("status", update.model_dump_json(exclude={"data"}))
                continue

            # Not a status: the saved values, which only arrive after COMPLETED.
            yield sse_event("data", _jsonify(process(update)))

        if failure is not None:
            yield sse_event("error", json.dumps({"error": failure}))
    except Exception as error:
        # Includes anything `process` raised. The stream has to close cleanly
        # either way, so the exception becomes the last frame.
        yield sse_event("error", json.dumps({"error": str(error)}))


def stream_tool(state, tool, model, *args: Any, **kwargs: Any) -> StreamingResponse:
    """Run an nnsightful tool and return its progress as an SSE response.

    The whole of what a tool route does. Three of them (logit lens, j-lens,
    activation patching) differ only in which tool and which arguments, so they
    say exactly that and nothing else.

    Remote and local end up at the same event vocabulary, deliberately: local
    execution has no status to report, so it yields a single `data` frame and the
    client cannot tell the difference. That is the point — ``REMOTE=false`` is a
    development mode, and it should not need its own path through the UI.

    The tool's ``to_data_obj`` is what turns NDIF's dict of saved values into the
    payload; it runs here, when the values land, rather than in a separate
    collect request.

    That dict is keyed by the *name of the variable the tool saved*, which for
    every nnsightful tool is ``results`` — so unwrapping that key is what turns
    NDIF's reply into the tool's own arguments. It is a real coupling to the
    tool's internals, and it is the one the previous collect routes had too
    (``backend()["results"]``).
    """
    if not state.remote:
        return StreamingResponse(
            stream_value(tool(model, *args, remote=False, **kwargs)),
            media_type=MEDIA_TYPE,
            headers=HEADERS,
        )

    backend = state.make_backend(model)
    # Submits on the trace's exit and returns; the awaiting happens in the
    # stream. `non_blocking` keeps the tool from reaching for a result that, on
    # this path, arrives long after the block's frame is gone.
    tool._run(
        model,
        *args,
        remote=True,
        backend=backend,
        non_blocking=True,
        raw=False,
        **kwargs,
    )

    return StreamingResponse(
        stream_backend(backend, lambda saves: tool.to_data_obj(**saves["results"])),
        media_type=MEDIA_TYPE,
        headers=HEADERS,
    )


async def stream_value(value: Any) -> AsyncIterator[str]:
    """A one-frame stream: for local execution, which has nothing to report."""
    yield sse_event("data", _jsonify(value))


async def stream_error(message: str) -> AsyncIterator[str]:
    """A one-frame stream carrying a failure the route caught before any work."""
    yield sse_event("error", json.dumps({"error": message}))
