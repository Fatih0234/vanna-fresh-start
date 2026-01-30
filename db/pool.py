"""
Database connection pool using psycopg2.

Provides a thread-safe connection pool for the Supabase PostgreSQL database,
reusing the existing SUPABASE_* environment variables.
"""

import os
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool

_pool = None


def init_pool(min_conn=2, max_conn=10):
    """Initialize the connection pool from SUPABASE_* env vars.

    Args:
        min_conn: Minimum number of connections to keep open.
        max_conn: Maximum number of connections allowed.

    Returns:
        The initialized connection pool.
    """
    global _pool
    if _pool is not None:
        return _pool

    _pool = pool.ThreadedConnectionPool(
        min_conn,
        max_conn,
        host=os.getenv("SUPABASE_HOST"),
        port=int(os.getenv("SUPABASE_PORT", "5432")),
        database=os.getenv("SUPABASE_DATABASE", "postgres"),
        user=os.getenv("SUPABASE_USER", "postgres"),
        password=os.getenv("SUPABASE_PASSWORD"),
        sslmode="require",
    )
    return _pool


@contextmanager
def get_connection():
    """Get a connection from the pool as a context manager.

    Usage:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    global _pool
    if _pool is None:
        raise RuntimeError("Database pool not initialized. Call init_pool() first.")

    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def close_pool():
    """Close all connections in the pool."""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
