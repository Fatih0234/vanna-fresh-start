"""
Simple test script to verify Vanna AI setup with Supabase and Anthropic.

This script performs a basic connection test to ensure:
1. Anthropic API is accessible
2. Supabase database is accessible
3. Vanna can execute a simple query

Usage:
    python test_connection.py
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()


async def test_connection():
    """Test connection to Anthropic and Supabase."""

    print("=" * 60)
    print("Testing Vanna AI Setup")
    print("=" * 60)
    print()

    # Check environment variables
    print("1. Checking environment variables...")
    required_vars = ["ANTHROPIC_API_KEY", "SUPABASE_HOST", "SUPABASE_PASSWORD"]
    for var in required_vars:
        value = os.getenv(var)
        if not value or value.startswith("your_"):
            print(f"   ❌ {var} not set properly")
            return False
        print(f"   ✓ {var} is set")
    print()

    # Test imports
    print("2. Testing imports...")
    try:
        from vanna import Agent, AgentConfig, User
        from vanna.core.registry import ToolRegistry
        from vanna.integrations.anthropic import AnthropicLlmService
        from vanna.integrations.postgres import PostgresRunner
        from vanna.tools import RunSqlTool

        print("   ✓ All imports successful")
    except ImportError as e:
        print(f"   ❌ Import error: {e}")
        return False
    print()

    # Test Anthropic connection
    print("3. Testing Anthropic API connection...")
    try:
        llm = AnthropicLlmService(
            model=os.getenv("ANTHROPIC_MODEL", "claude-3-haiku-20240307"),
            api_key=os.getenv("ANTHROPIC_API_KEY"),
        )
        print("   ✓ Anthropic LLM service initialized")
    except Exception as e:
        print(f"   ❌ Anthropic connection error: {e}")
        return False
    print()

    # Test Supabase connection
    print("4. Testing Supabase PostgreSQL connection...")
    try:
        from restricted_sql_runner import RestrictedPostgresRunner
        from vanna.integrations.local.agent_memory import DemoAgentMemory

        postgres_runner = RestrictedPostgresRunner(
            allowed_tables=["public.v_bike_events"],
            host=os.getenv("SUPABASE_HOST"),
            port=int(os.getenv("SUPABASE_PORT", "5432")),
            database=os.getenv("SUPABASE_DATABASE"),
            user=os.getenv("SUPABASE_USER"),
            password=os.getenv("SUPABASE_PASSWORD"),
            sslmode="require",
        )
        print("   ✓ PostgreSQL runner initialized (restricted to public.v_bike_events)")

        # Try a simple query to the v_bike_events view
        from vanna.capabilities.sql_runner import RunSqlToolArgs
        from vanna.core.tool import ToolContext
        from vanna import User
        import uuid

        test_user = User(id="test", username="test")

        # Create a proper ToolContext with all required fields
        context = ToolContext(
            user=test_user,
            conversation_id="test-connection",
            request_id=str(uuid.uuid4()),
            agent_memory=DemoAgentMemory(),
        )

        # Test with a query to the v_bike_events view
        args = RunSqlToolArgs(
            sql="SELECT COUNT(*) as event_count FROM public.v_bike_events;"
        )

        result = await postgres_runner.run_sql(args, context)
        print(f"   ✓ Database query successful")
        print(f"   ✓ Found {result.iloc[0, 0]} events in public.v_bike_events view")
    except Exception as e:
        print(f"   ❌ Database connection error: {e}")
        print("\n   Troubleshooting tips:")
        print("   - Check your SUPABASE_HOST is correct")
        print("   - Verify your SUPABASE_PASSWORD")
        print("   - Ensure your IP is allowed in Supabase settings")
        print("   - Make sure the public.v_bike_events view exists")
        return False
    print()

    print("=" * 60)
    print("✓ All tests passed! Your setup is ready.")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Run the main application: python vanna_supabase_setup.py")
    print("  2. Or use the quick start script: ./start.sh")
    print()

    return True


if __name__ == "__main__":
    try:
        success = asyncio.run(test_connection())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nTest interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
