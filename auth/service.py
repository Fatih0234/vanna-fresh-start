"""
Authentication service: password hashing and JWT management.
"""

import os
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict

import bcrypt
import jwt

logger = logging.getLogger(__name__)

_jwt_secret: Optional[str] = None


def get_jwt_secret() -> str:
    """Get the JWT secret, initializing from env or generating a random one."""
    global _jwt_secret
    if _jwt_secret is None:
        _jwt_secret = os.getenv("JWT_SECRET")
        if not _jwt_secret:
            _jwt_secret = secrets.token_hex(32)
            logger.warning(
                "JWT_SECRET not set. Generated a random secret. "
                "Sessions will not survive server restart. "
                "Set JWT_SECRET in .env for persistent sessions."
            )
    return _jwt_secret


def hash_password(plain: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
        "utf-8"
    )


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_jwt(
    user_id: str,
    email: str,
    display_name: Optional[str] = None,
    expires_hours: int = 72,
) -> str:
    """Create a JWT token for the given user."""
    secret = get_jwt_secret()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "name": display_name or "",
        "iat": now,
        "exp": now + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_jwt(token: str) -> Optional[Dict]:
    """Verify and decode a JWT token. Returns payload dict or None on failure."""
    secret = get_jwt_secret()
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None
