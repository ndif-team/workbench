from fastapi import Request, HTTPException, Depends
import logging
from typing import Optional

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
