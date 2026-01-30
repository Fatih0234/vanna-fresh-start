#!/usr/bin/env python3
"""
Apply database migrations in order.

Usage:
    python scripts/run_migrations.py
"""

import os
import sys
import glob

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

import psycopg2


def get_connection():
    return psycopg2.connect(
        host=os.getenv("SUPABASE_HOST"),
        port=int(os.getenv("SUPABASE_PORT", "5432")),
        database=os.getenv("SUPABASE_DATABASE", "postgres"),
        user=os.getenv("SUPABASE_USER", "postgres"),
        password=os.getenv("SUPABASE_PASSWORD"),
        sslmode="require",
    )


def ensure_migrations_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TIMESTAMPTZ DEFAULT now()
            );
        """)
    conn.commit()


def get_applied_migrations(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT version FROM schema_migrations ORDER BY version;")
        return {row[0] for row in cur.fetchall()}


def apply_migration(conn, version, sql):
    with conn.cursor() as cur:
        cur.execute(sql)
        cur.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s);",
            (version,),
        )
    conn.commit()


def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), "..", "migrations")
    migration_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

    if not migration_files:
        print("No migration files found in migrations/")
        return

    conn = get_connection()
    try:
        ensure_migrations_table(conn)
        applied = get_applied_migrations(conn)

        for filepath in migration_files:
            version = os.path.basename(filepath)
            if version in applied:
                print(f"  [skip] {version} (already applied)")
                continue

            print(f"  [apply] {version} ...", end=" ")
            with open(filepath, "r") as f:
                sql = f.read()

            try:
                apply_migration(conn, version, sql)
                print("OK")
            except Exception as e:
                conn.rollback()
                print(f"FAILED: {e}")
                sys.exit(1)

        print("\nAll migrations applied.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
