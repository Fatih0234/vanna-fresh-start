"""
PostgreSQL-backed ConversationStore implementation.

Persists conversations and messages to the chat_conversations / chat_messages
tables in Supabase Postgres. Uses the db.pool module for connections.
"""

import json
import logging
from datetime import datetime, timezone
from typing import List, Optional

from vanna.core.storage import ConversationStore, Conversation, Message
from vanna.core.user.models import User
from vanna.core.tool.models import ToolCall

from db import get_connection

logger = logging.getLogger(__name__)


class PostgresConversationStore(ConversationStore):
    """Conversation store backed by PostgreSQL."""

    @staticmethod
    def _assert_conversation_owner(cur, conversation_id: str, user_id: str) -> None:
        """Ensure an existing conversation belongs to the user."""
        cur.execute(
            "SELECT user_id FROM chat_conversations WHERE id = %s;",
            (conversation_id,),
        )
        row = cur.fetchone()
        if row and str(row[0]) != str(user_id):
            raise PermissionError("Conversation does not belong to user")

    async def create_conversation(
        self, conversation_id: str, user: User, initial_message: str
    ) -> Conversation:
        """Create a new conversation with the initial user message."""
        title = initial_message[:80] if initial_message else None
        now = datetime.now(timezone.utc)

        with get_connection() as conn:
            with conn.cursor() as cur:
                self._assert_conversation_owner(cur, conversation_id, user.id)
                cur.execute(
                    """
                    INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (conversation_id, user.id, title, now, now),
                )
                cur.execute(
                    """
                    INSERT INTO chat_messages (conversation_id, role, content, created_at)
                    VALUES (%s, %s, %s, %s);
                    """,
                    (conversation_id, "user", initial_message, now),
                )

        conversation = Conversation(
            id=conversation_id,
            user=user,
            messages=[Message(role="user", content=initial_message, timestamp=now)],
            created_at=now,
            updated_at=now,
        )
        return conversation

    async def get_conversation(
        self, conversation_id: str, user: User
    ) -> Optional[Conversation]:
        """Get conversation by ID, scoped to user."""
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, title, created_at, updated_at, metadata
                    FROM chat_conversations
                    WHERE id = %s AND user_id = %s;
                    """,
                    (conversation_id, user.id),
                )
                row = cur.fetchone()
                if not row:
                    return None

                conv_id, title, created_at, updated_at, metadata = row

                cur.execute(
                    """
                    SELECT role, content, tool_calls, tool_call_id, metadata, created_at
                    FROM chat_messages
                    WHERE conversation_id = %s
                    ORDER BY created_at, id;
                    """,
                    (conversation_id,),
                )
                message_rows = cur.fetchall()

        messages = []
        for msg_row in message_rows:
            role, content, tool_calls_json, tool_call_id, msg_meta, msg_ts = msg_row
            tool_calls = None
            if tool_calls_json:
                tool_calls = [ToolCall(**tc) for tc in tool_calls_json]
            messages.append(
                Message(
                    role=role,
                    content=content or "",
                    tool_calls=tool_calls,
                    tool_call_id=tool_call_id,
                    metadata=msg_meta or {},
                    timestamp=msg_ts,
                )
            )

        return Conversation(
            id=conv_id,
            user=user,
            messages=messages,
            created_at=created_at,
            updated_at=updated_at,
            metadata=metadata or {},
        )

    async def update_conversation(self, conversation: Conversation) -> None:
        """Update conversation with new messages (diff-based).

        The Agent calls this multiple times during a request. We query the
        current message count in DB and only INSERT messages beyond that count.
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                self._assert_conversation_owner(cur, conversation.id, conversation.user.id)
                # Get current message count in DB
                cur.execute(
                    "SELECT COUNT(*) FROM chat_messages WHERE conversation_id = %s;",
                    (conversation.id,),
                )
                result = cur.fetchone()
                db_count = result[0] if result else 0

                # Calculate new messages to insert
                new_messages = conversation.messages[db_count:]

                # Only proceed if there are new messages to add
                if not new_messages:
                    # Ensure conversation row exists (but don't update timestamp)
                    cur.execute(
                        """
                        INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING;
                        """,
                        (
                            conversation.id,
                            conversation.user.id,
                            None,
                            conversation.created_at or datetime.now(timezone.utc),
                            conversation.created_at or datetime.now(timezone.utc),
                        ),
                    )
                    return

                # Ensure conversation row exists (will update timestamp below)
                cur.execute(
                    """
                    INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (
                        conversation.id,
                        conversation.user.id,
                        None,
                        conversation.created_at or datetime.now(timezone.utc),
                        conversation.created_at or datetime.now(timezone.utc),
                    ),
                )

                # Insert new messages
                for msg in new_messages:
                    tool_calls_json = None
                    if msg.tool_calls:
                        tool_calls_json = json.dumps(
                            [tc.model_dump() for tc in msg.tool_calls]
                        )
                    cur.execute(
                        """
                        INSERT INTO chat_messages
                            (conversation_id, role, content, tool_calls, tool_call_id, metadata, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s);
                        """,
                        (
                            conversation.id,
                            msg.role,
                            msg.content,
                            tool_calls_json,
                            msg.tool_call_id,
                            json.dumps(msg.metadata) if msg.metadata else None,
                            msg.timestamp,
                        ),
                    )

                # Auto-set title from first user message if not yet set
                if new_messages:
                    cur.execute(
                        """
                        UPDATE chat_conversations
                        SET title = COALESCE(title, %s), updated_at = %s
                        WHERE id = %s;
                        """,
                        (
                            self._extract_title(conversation.messages),
                            datetime.now(timezone.utc),
                            conversation.id,
                        ),
                    )

    async def delete_conversation(self, conversation_id: str, user: User) -> bool:
        """Delete conversation (cascades to messages)."""
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM chat_conversations
                    WHERE id = %s AND user_id = %s;
                    """,
                    (conversation_id, user.id),
                )
                return cur.rowcount > 0

    async def list_conversations(
        self, user: User, limit: int = 50, offset: int = 0
    ) -> List[Conversation]:
        """List conversations for user, ordered by most recent first."""
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT c.id, c.title, c.created_at, c.updated_at, c.metadata,
                           (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id)
                    FROM chat_conversations c
                    WHERE c.user_id = %s
                    ORDER BY c.updated_at DESC
                    LIMIT %s OFFSET %s;
                    """,
                    (user.id, limit, offset),
                )
                rows = cur.fetchall()

        conversations = []
        for row in rows:
            conv_id, title, created_at, updated_at, metadata, msg_count = row
            conv = Conversation(
                id=conv_id,
                user=user,
                messages=[],  # Don't load messages for list view
                created_at=created_at,
                updated_at=updated_at,
                metadata={**(metadata or {}), "message_count": msg_count},
            )
            if title:
                conv.metadata["title"] = title
            conversations.append(conv)

        return conversations

    @staticmethod
    def _extract_title(messages: List[Message]) -> Optional[str]:
        """Extract a title from the first user message."""
        for msg in messages:
            if msg.role == "user" and msg.content.strip():
                text = msg.content.strip()
                return text[:80] + ("..." if len(text) > 80 else "")
        return None
