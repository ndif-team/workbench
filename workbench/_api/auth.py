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


def get_workshop_session_id(request: Request) -> Optional[str]:
    """Return the X-Workshop-Session value if it looks like a workshop session id.

    Workshop sessions are anonymous — created by the Next.js server action's
    cookie, then forwarded to the API by workshop-mode server actions when
    they need to hit live endpoints (e.g. /branching/continue for "Generate
    full alternate trajectory"). Format: "wkshp-<uuid-ish>".
    """
    raw = request.headers.get("X-Workshop-Session")
    if not raw:
        return None
    raw = raw.strip()
    if not raw.startswith("wkshp-") or len(raw) > 256:
        return None
    return raw


class CallerIdentity:
    """Tagged identity for a request.

    Routes that support both signed-in researchers and anonymous workshop
    participants use this to drive auth + model-access decisions.
    """

    __slots__ = ("user_email", "workshop_session")

    def __init__(self, user_email: Optional[str], workshop_session: Optional[str]):
        self.user_email = user_email
        self.workshop_session = workshop_session

    @property
    def is_workshop(self) -> bool:
        return self.workshop_session is not None


def require_user_or_workshop(request: Request) -> CallerIdentity:
    """Accept either X-User-Email OR X-Workshop-Session — workshop participants
    don't have email auth, but their pre-cached session id grants access to
    the curated workshop models.
    """
    workshop = get_workshop_session_id(request)
    user_email = get_user_email(request)
    if not workshop and not user_email:
        raise HTTPException(
            status_code=401,
            detail="X-User-Email or X-Workshop-Session header is required",
        )
    return CallerIdentity(user_email=user_email, workshop_session=workshop)


def user_has_model_access(user_email: str, model_name: str, state: "AppState") -> bool:
    if user_email is None or user_email == "guest@localhost":
        if model_name not in state.model_metadata:
            return False
        if state.model_metadata[model_name].gated:
            return False

    return True


def caller_has_model_access(
    caller: CallerIdentity, model_name: str, state: "AppState"
) -> bool:
    """Workshop sessions can access any model the AppState knows about — the
    workshop config's model list is the gate. Researchers go through the
    standard email-based gated-repo check.
    """
    if caller.is_workshop:
        return model_name in state.model_metadata
    return user_has_model_access(caller.user_email or "", model_name, state)

