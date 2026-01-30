-- Migration 002: Create chat persistence tables

CREATE TABLE IF NOT EXISTS chat_conversations (
    id              TEXT PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title           TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chat_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    tool_calls      JSONB,
    tool_call_id    TEXT,
    metadata        JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages (conversation_id, created_at);
