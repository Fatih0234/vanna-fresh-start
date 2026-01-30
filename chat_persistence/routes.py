"""
Conversation API routes for the chat history sidebar.

These routes are registered on the FastAPI app and protected by auth.
"""

import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from auth.service import verify_jwt
from chat_persistence.store import PostgresConversationStore
from vanna.core.storage import Conversation
from vanna.core.user.models import User


def register_conversation_routes(app: FastAPI, store: PostgresConversationStore):
    """Register conversation API routes on the FastAPI app."""

    def _get_user_from_request(request: Request) -> User:
        """Extract authenticated user from request cookie."""
        token = request.cookies.get("session")
        if not token:
            raise PermissionError("Not authenticated")
        payload = verify_jwt(token)
        if not payload:
            raise PermissionError("Invalid or expired session")
        return User(
            id=payload["sub"],
            username=payload.get("name", ""),
            email=payload["email"],
        )

    @app.get("/api/conversations")
    async def list_conversations(request: Request):
        """List conversations for the authenticated user."""
        try:
            user = _get_user_from_request(request)
        except PermissionError:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        conversations = await store.list_conversations(user)
        return [
            {
                "id": c.id,
                "title": c.metadata.get("title", c.id),
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                "message_count": c.metadata.get("message_count", 0),
            }
            for c in conversations
        ]

    @app.post("/api/conversations")
    async def create_conversation(request: Request):
        """Create an empty conversation and return its ID."""
        try:
            user = _get_user_from_request(request)
        except PermissionError:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        conversation_id = f"conv_{uuid.uuid4()}"
        conversation = Conversation(id=conversation_id, user=user, messages=[])
        await store.update_conversation(conversation)

        return {
            "id": conversation_id,
            "created_at": conversation.created_at.isoformat()
            if conversation.created_at
            else None,
        }

    @app.get("/api/conversations/{conversation_id}")
    async def get_conversation(conversation_id: str, request: Request):
        """Get a conversation with all messages."""
        try:
            user = _get_user_from_request(request)
        except PermissionError:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        conversation = await store.get_conversation(conversation_id, user)
        if not conversation:
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        return {
            "id": conversation.id,
            "title": conversation.metadata.get("title") or _title_from_messages(conversation.messages),
            "created_at": conversation.created_at.isoformat() if conversation.created_at else None,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.timestamp.isoformat() if m.timestamp else None,
                }
                for m in conversation.messages
                if m.role in ("user", "assistant")
            ],
        }

    @app.delete("/api/conversations/{conversation_id}")
    async def delete_conversation(conversation_id: str, request: Request):
        """Delete a conversation."""
        try:
            user = _get_user_from_request(request)
        except PermissionError:
            return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

        deleted = await store.delete_conversation(conversation_id, user)
        if not deleted:
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        return {"status": "deleted"}


def _title_from_messages(messages) -> str:
    """Extract title from the first user message."""
    for m in messages:
        if m.role == "user" and m.content.strip():
            text = m.content.strip()
            return text[:80] + ("..." if len(text) > 80 else "")
    return "New Chat"
