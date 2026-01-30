-- Migration 001: Create app_users table for private authentication
-- No public signup - users are seeded via scripts/seed_users.py

CREATE TABLE IF NOT EXISTS app_users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT,
    role          TEXT DEFAULT 'viewer',
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users (email);
