"""
JWT-based UserResolver for the Vanna Agent framework.

Reads the session cookie from RequestContext and resolves to a User.
"""

from vanna.core.user.resolver import UserResolver
from vanna.core.user.models import User
from vanna.core.user.request_context import RequestContext

from .service import verify_jwt


class JwtUserResolver(UserResolver):
    """Resolves users from JWT session cookies."""

    async def resolve_user(self, request_context: RequestContext) -> User:
        """Resolve user from the session cookie in the request context."""
        token = request_context.get_cookie("session")
        if not token:
            raise PermissionError("Not authenticated: no session cookie")

        payload = verify_jwt(token)
        if not payload:
            raise PermissionError("Not authenticated: invalid or expired session")

        return User(
            id=payload["sub"],
            username=payload.get("name", ""),
            email=payload["email"],
        )
