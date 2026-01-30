-- Migration 003: Ensure pgcrypto extension is available for UUID generation

CREATE EXTENSION IF NOT EXISTS pgcrypto;
