from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import os
import traceback
import anyio

from .routes import lens, patch, models, logit_lens, activation_patching, causal_mediation
from .state import AppState

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")

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

ALLOWED_ORIGIN_REGEX = (
    # Vercel dev/staging previews + ripley-cluster PR previews.
    r"^https://(workbench-[a-z0-9\-]*-ndif\.vercel\.app|pr-[a-z0-9\-]+\.ndif-preview\.ripley\.cloud)$"
    if os.environ.get('CONFIG') != "prod"
    else None  # in prod, rely on the fixed list above
)


def fastapi_app():
    app = FastAPI()

    # In environments where the fronting ingress handles CORS (e.g. the
    # ripley preview chart sets enable-cors annotations and needs OPTIONS
    # to bypass auth_request *before* this app sees it), opt out of the
    # CORSMiddleware so we don't emit duplicate Access-Control-* headers.
    # Normalize the env var so a stray "TRUE" / " true" / "1" doesn't
    # silently re-enable CORS and break the preview ingress.
    skip_cors = os.environ.get("SKIP_CORS_MIDDLEWARE", "").strip().lower() in (
        "1", "true", "yes", "on",
    )
    if not skip_cors:
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
    app.include_router(logit_lens, prefix="/logit_lens")
    app.include_router(activation_patching, prefix="/activation_patching")
    app.include_router(causal_mediation, prefix="/causal_mediation", tags=["causal_mediation"])
    app.include_router(patch, prefix="/patch")
    app.include_router(models, prefix="/models")

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        tb = traceback.format_exception(type(exc), exc, exc.__traceback__)
        logging.error(f"Unhandled exception: {''.join(tb)}")
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc), "traceback": ''.join(tb[-3:])},
        )

    app.state.m = AppState()

    return app


app = fastapi_app()
