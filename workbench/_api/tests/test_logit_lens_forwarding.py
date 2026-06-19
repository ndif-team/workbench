"""
Regression test for C1a: the /logit_lens route must forward the request's
`topk` / `include_entropy` into the tool. Before the fix, `start_logit_lens`
called `logit_lens._run(model, prompt, ...)` without these, so the tool ran at
its hard-coded `format(top_k=5)` default and the UI's Top-K was silently
ignored.

Runs without NDIF: the model/backend/tool are stubbed; we only assert what the
route forwards.
"""

import asyncio

from nnsightful.tools.logit_lens import logit_lens as lens_tool
from _api.routes.logit_lens import start_logit_lens, LogitLensRequest, logit_lens as route_tool

# The route holds the same tool singleton we patch.
assert route_tool is lens_tool


class _FakeBackend:
    # blocking=False makes the route take the job-id branch and return the raw
    # `_run` output, so we never need a real `to_data_obj`.
    blocking = False


class _FakeState:
    """Minimal stand-in for AppState used by the route."""

    remote = True

    def __getitem__(self, _model_name):
        return object()  # opaque model sentinel; the stubbed _run ignores it

    def make_backend(self, model=None, job_id=None):
        return _FakeBackend()


def _run_route(req):
    return asyncio.run(start_logit_lens(req, _FakeState(), "tester@example.com"))


def test_topk_and_entropy_are_forwarded(monkeypatch):
    captured = {}

    def fake_run(model, prompt, *args, **kwargs):
        captured["args"] = args
        captured["kwargs"] = kwargs
        return "JOB123"

    monkeypatch.setattr(lens_tool, "_run", fake_run)

    req = LogitLensRequest(model="meta-llama/Llama-3.1-8B", prompt="hi", topk=9, include_entropy=False)
    result = _run_route(req)

    assert result == {"job_id": "JOB123"}
    assert captured["kwargs"].get("top_k") == 9
    assert captured["kwargs"].get("include_entropy") is False


def test_defaults_are_forwarded_when_unset(monkeypatch):
    captured = {}

    def fake_run(model, prompt, *args, **kwargs):
        captured["kwargs"] = kwargs
        return "JOB456"

    monkeypatch.setattr(lens_tool, "_run", fake_run)

    # Request defaults: topk=5, include_entropy=True (per LogitLensRequest).
    req = LogitLensRequest(model="m", prompt="hi")
    _run_route(req)

    assert captured["kwargs"].get("top_k") == 5
    assert captured["kwargs"].get("include_entropy") is True
