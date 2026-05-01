"""Minimal FastAPI app for local smoke-testing of the workshop loader.

Only mounts /examples. Skips the heavy NDIF state init that the full main:app
requires. Use this when you want to E2E-test workshop pages without bringing
up the full ML stack:

    uv run uvicorn workbench._api._minimal_app:app --host 0.0.0.0 --port 8000

The full app is in `workbench/_api/main.py`.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes.examples import router as examples_router


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(examples_router, prefix="/examples")
