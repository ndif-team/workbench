import logging
from typing import TYPE_CHECKING, Optional

from fastapi import Depends, HTTPException, Request

if TYPE_CHECKING:
    from workbench._api.state import AppState

logger = logging.getLogger(__name__)

def get_user_email(request: Request) -> Optional[str]:
        """
        Extract user email from X-User-Email header.
        Returns None if header is missing or empty.
        """
        user_email = request.headers.get("X-User-Email")
        
        if not user_email or user_email.strip() == "":
            return None
        
        # Clean and return the email
        cleaned_email = user_email.strip()
        
        return cleaned_email

def require_user_email(request: Request) -> str:
    """
    Extract user email from X-User-Email header.
    Raises HTTPException(401) if header is missing or empty.
    """

    user_email = get_user_email(request)
    if not user_email:
        raise HTTPException(
            status_code=401,
            detail="X-User-Email header is required"
        )
    return user_email

def user_has_model_access(user_email: str, model_name: str, state: "AppState") -> bool:
    if user_email is None or user_email == "guest@localhost":
        if model_name not in state.model_metadata:
            return False
        if state.model_metadata[model_name].gated:
            return False

    return True


def require_model_access(state: "AppState", user_email: str, model_name: str) -> None:
    """Refuse a caller who cannot use this model, before anything runs.

    A route calls this while it can still fail the ordinary way: once it starts
    streaming, the status line is gone and a refusal can only be an `error` frame
    (see ``sse``). Local deployments gate nothing -- there is no catalog to be
    outside of.
    """
    if state.remote and not user_has_model_access(user_email, model_name, state):
        raise HTTPException(
            status_code=403, detail=f"User does not have access to {model_name}"
        )

