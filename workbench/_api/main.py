from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os
import anyio

from .routes import lens, lens2, patch, models, logit_lens, activation_patching
from .state import AppState

from dotenv import load_dotenv; load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


ALLOWED_ORIGINS = [
    # Prod
    "https://workbench.ndif.us"
]

if os.environ.get('CONFIG') != "prod":
    ALLOWED_ORIGINS.append("http://localhost:3000")
    ALLOWED_ORIGINS.append("http://127.0.0.1:3000")

ALLOWED_ORIGIN_REGEX = (
    r"^https://workbench-[a-z0-9\-]*-ndif\.vercel\.app$"  # dev/staging previews
    if os.environ.get('CONFIG') != "prod"
    else None  # in prod, rely on the fixed list above
)


def fastapi_app():
    app = FastAPI()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_origin_regex=ALLOWED_ORIGIN_REGEX,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,
    )

    app.include_router(lens, prefix="/lens")
    app.include_router(lens2, prefix="/lens2")
    app.include_router(logit_lens, prefix="/logit_lens")
    app.include_router(activation_patching, prefix="/activation_patching")
    app.include_router(patch, prefix="/patch")
    app.include_router(models, prefix="/models")

    app.state.m = AppState()

    return app


app = fastapi_app()
