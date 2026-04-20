"""Streaming remote backend used by workbench SSE endpoints.

Unlike the parent ``RemoteBackend`` — which runs the WebSocket receive loop
inline and blocks ``__call__`` until the job finishes — this subclass defers
both submission and status-waiting so the calling FastAPI route can drive
the lifecycle asynchronously and forward each update to the browser as a
Server-Sent Event.

Lifecycle:

    1. nnsight's trace / session ``__exit__`` invokes ``__call__(tracer)``
       synchronously. We capture the tracer and serialize the request
       payload, but perform no I/O.
    2. The route opens the SSE stream and does ``async for response in backend``.
       On the first step, the backend opens an async WebSocket, stamps the
       socket session id into the request headers, POSTs the submit, and
       begins yielding :class:`ResponseModel` updates as they arrive.
    3. When ``COMPLETED`` arrives, the result is downloaded via the parent's
       ``async_get_result``; ``response.data`` is replaced with the downloaded
       dict of save-keyed tensors, the response is yielded one last time,
       and iteration ends.
    4. On ``ERROR``, the response is yielded and :class:`RemoteException`
       is raised.
"""

from __future__ import annotations

from typing import Any, AsyncIterator, Dict, Optional

import httpx
import socketio

from nnsight.intervention.backends.remote import RemoteBackend, RemoteException
from nnsight.schema.response import ResponseModel


class StreamingRemoteBackend(RemoteBackend):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._request_data: Optional[bytes] = None
        self._request_headers: Optional[Dict[str, str]] = None
        self._tracer = None

    def __call__(self, tracer=None):
        """Capture tracer and serialize the request. Fires on trace/session __exit__."""
        if tracer is None:
            return None
        self._tracer = tracer
        self._request_data, self._request_headers = self.request(tracer)

    async def __aiter__(self) -> AsyncIterator[ResponseModel]:
        if self._request_data is None:
            raise RuntimeError(
                "StreamingRemoteBackend is not primed; it must be passed as the "
                "`backend` argument to a model.trace(...) or model.session(...) "
                "context before iteration."
            )

        async with socketio.AsyncSimpleClient(reconnection_attempts=10) as sio:
            await sio.connect(
                self.ws_address,
                socketio_path="/ws/socket.io",
                transports=["websocket"],
                wait_timeout=10,
            )

            headers = dict(self._request_headers)
            headers["ndif-session_id"] = sio.sid

            initial = await self._async_submit(self._request_data, headers)
            self.job_id = initial.id

            if initial.status == ResponseModel.JobStatus.COMPLETED:
                await self._async_finalize(initial)
                yield initial
                return
            if initial.status == ResponseModel.JobStatus.ERROR:
                yield initial
                raise RemoteException(initial.description)

            yield initial

            while True:
                msg = await sio.receive(timeout=None)
                response = ResponseModel.unpickle(msg[1])

                if response.status == ResponseModel.JobStatus.COMPLETED:
                    await self._async_finalize(response)
                    yield response
                    return
                if response.status == ResponseModel.JobStatus.ERROR:
                    yield response
                    raise RemoteException(response.description)

                yield response

    async def _async_submit(self, data: bytes, headers: Dict[str, str]) -> ResponseModel:
        headers = {**headers, "Content-Type": "application/octet-stream"}
        timeout = httpx.Timeout(self.CONNECT_TIMEOUT, read=self.READ_TIMEOUT)
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{self.address}/request",
                content=data,
                headers=headers,
            )
        if resp.status_code == 200:
            return ResponseModel(**resp.json())
        try:
            msg = resp.json()["detail"]
        except Exception:
            msg = resp.reason_phrase
        raise ConnectionError(msg)

    async def _async_finalize(self, response: ResponseModel) -> None:
        """Download the final payload (if delivered as a URL) and inline it."""
        result: Any = response.data
        if isinstance(result, str):
            result = await self.async_get_result(result)
        elif isinstance(result, (tuple, list)):
            result = await self.async_get_result(*result)
        response.data = result
