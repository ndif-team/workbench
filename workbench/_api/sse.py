"""Server-Sent Events for the nnsightful tool routes.

A tool route is one POST whose response stays open for the life of the run:
the client gets each NDIF status update as it lands and then the tool's data,
over a single connection, with no job id to poll and no second request for
the result.

Every tool route sends the same three events:

    status  an NDIF status update: nnsight's ``ResponseModel`` without ``data``
    data    the tool's data; ends the stream
    error   ``{"error": "..."}``; ends the stream

Once the stream is open, a failure is an ``error`` event rather than an HTTP
status, since the status line went out with the headers. A route can still
fail the ordinary way before it starts streaming, e.g. for an unknown model.

A local run (``REMOTE=false``) is a single ``data`` event, so the client has
one path for both modes.
"""

import asyncio
import json
import logging
from contextlib import aclosing
from typing import Any, AsyncGenerator, AsyncIterator

from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from nnsightful import ExecMode, Tool

logger = logging.getLogger(__name__)


class ToolEventStream:
    """One run of an nnsightful tool, streamed to the client as SSE.

    Holds the call (the tool, the model and the tool's arguments) and makes it
    only once the response starts streaming, so that anything that fails, from
    submitting the job to building its data, reaches the client as an
    ``error`` event.

    A remote run is submitted with ``ExecMode.REMOTE_ASYNC`` and followed
    through its ``AsyncToolBackend``: each update becomes a ``status`` event,
    and its result the ``data`` event. While it waits, an SSE comment goes out
    every ``HEARTBEAT`` seconds so that proxies don't drop the connection as
    idle; clients ignore comments. The proxy in front of the app must also not
    buffer the response, which ``HEADERS`` asks of nginx.

    Example:
        return ToolEventStream(logit_lens, model, req.prompt, remote=state.remote, top_k=req.topk).response()
    """

    MEDIA_TYPE = "text/event-stream"
    HEADERS = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    HEARTBEAT = 15.0
    KEEPALIVE = ": keepalive\n\n"

    def __init__(self, tool: Tool, model: Any, *args: Any, remote: bool, **kwargs: Any) -> None:
        self.remote = remote
        self.tool = tool
        self.model = model
        self.args = args
        self.kwargs = kwargs

    def response(self) -> StreamingResponse:
        """The streaming response that runs the tool."""
        return StreamingResponse(self.events(), media_type=self.MEDIA_TYPE, headers=self.HEADERS)

    async def events(self) -> AsyncIterator[str]:
        """Run the tool, yielding its SSE events through ``data`` or ``error``."""
        try:
            if self.remote:
                run = self.tool(self.model, *self.args, exec_mode=ExecMode.REMOTE_ASYNC, **self.kwargs)
                async with aclosing(self.heartbeat(run.updates())) as updates:
                    async for update in updates:
                        if update is None:
                            yield self.KEEPALIVE
                        else:
                            yield self.event("status", update.model_dump(mode="json", exclude={"data"}))
                data = await run.result()
            else:
                data = self.tool(self.model, *self.args, **self.kwargs)
            yield self.event("data", data)
        except Exception as error:
            logger.exception("%s run failed", type(self.tool).__name__)
            yield self.event("error", {"error": str(error)})

    async def heartbeat(self, updates: AsyncGenerator[Any, None]) -> AsyncIterator[Any]:
        """``updates``, with a ``None`` for every ``HEARTBEAT`` seconds that nothing arrives.

        On a heartbeat the pending update is left waiting rather than cancelled,
        since cancelling it would end ``updates`` and close the job's stream.
        Closing this generator closes ``updates`` too.
        """
        pending = None
        try:
            while True:
                if pending is None:
                    pending = asyncio.ensure_future(anext(updates))
                done, _ = await asyncio.wait({pending}, timeout=self.HEARTBEAT)
                if not done:
                    yield None
                    continue
                task, pending = pending, None
                try:
                    update = task.result()
                except StopAsyncIteration:
                    return
                yield update
        finally:
            if pending is not None:
                pending.cancel()
            else:
                await updates.aclose()

    @staticmethod
    def event(name: str, payload: Any) -> str:
        """One SSE event, its payload JSON-encoded (pydantic models included)."""
        return f"event: {name}\ndata: {json.dumps(jsonable_encoder(payload))}\n\n"
