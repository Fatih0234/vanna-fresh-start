#!/usr/bin/env python3
"""
Seed user accounts (no public signup).

Usage:
    python scripts/seed_users.py --email admin@company.com --password secret123 --name "Admin User"
    python scripts/seed_users.py --email admin@company.com --password secret123  # name is optional
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv

load_dotenv()

import bcrypt
import psycopg2


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
        "utf-8"
    )


def get_connection():
    return psycopg2.connect(
        host=os.getenv("SUPABASE_HOST"),
        port=int(os.getenv("SUPABASE_PORT", "5432")),
        database=os.getenv("SUPABASE_DATABASE", "postgres"),
        user=os.getenv("SUPABASE_USER", "postgres"),
        password=os.getenv("SUPABASE_PASSWORD"),
        sslmode="require",
    )


def main():
    parser = argparse.ArgumentParser(description="Create a user account")
    parser.add_argument("--email", required=True, help="User email")
    parser.add_argument("--password", required=True, help="User password")
    parser.add_argument("--name", default=None, help="Display name")
    parser.add_argument(
        "--role", default="viewer", choices=["admin", "viewer"], help="User role"
    )
    args = parser.parse_args()

    password_hash = hash_password(args.password)

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_users (email, password_hash, display_name, role)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (email) DO UPDATE SET
                    password_hash = EXCLUDED.password_hash,
                    display_name = EXCLUDED.display_name,
                    role = EXCLUDED.role
                RETURNING id, email, display_name, role;
                """,
                (args.email, password_hash, args.name, args.role),
            )
            row = cur.fetchone()
            conn.commit()

        print(f"User created/updated:")
        print(f"  ID:    {row[0]}")
        print(f"  Email: {row[1]}")
        print(f"  Name:  {row[2]}")
        print(f"  Role:  {row[3]}")
    except Exception as e:
        conn.rollback()
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
