"""Server-side polling helper for NDIF jobs.

The frontend has its own startAndPoll loop that hits `/response/{job_id}` on
NDIF directly. The precache script (and any other server-driven flow) needs
the same polling, but synchronously. This helper does that.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import requests

from .state import AppState


logger = logging.getLogger(__name__)


_TERMINAL_OK = {"COMPLETED"}
_TERMINAL_FAIL = {"ERROR", "NNSIGHT_ERROR"}


class NDIFJobError(RuntimeError):
    pass


def wait_for_job_and_collect(
    state: AppState,
    job_id: str,
    *,
    timeout_s: float = 1800.0,
    interval_s: float = 1.0,
) -> dict[str, Any]:
    """Poll NDIF /response/{job_id} until COMPLETED, then drive the backend
    consumer to fetch the saved tensors. Returns the dict keyed by saved
    variable names.
    """
    status_url = f"{state.ndif_backend_url}/response/{job_id}"
    started = time.time()

    while True:
        if time.time() - started > timeout_s:
            raise NDIFJobError(f"timed out waiting for job {job_id}")

        try:
            resp = requests.get(status_url, timeout=30)
        except requests.RequestException as e:
            raise NDIFJobError(f"NDIF status fetch failed: {e}") from e

        if not resp.ok:
            raise NDIFJobError(
                f"NDIF status {resp.status_code} for job {job_id}: {resp.text[:200]}"
            )

        data = resp.json()
        status = data.get("status")
        if status in _TERMINAL_OK:
            break
        if status in _TERMINAL_FAIL:
            raise NDIFJobError(f"NDIF job {job_id} failed: {data}")
        # Non-terminal — keep polling.
        time.sleep(interval_s)

    backend = state.make_backend(job_id=job_id)
    results = backend()
    if results is None:
        raise NDIFJobError(f"NDIF job {job_id} returned no results after COMPLETED")
    return results
