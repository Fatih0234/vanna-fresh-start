"""
Vanna AI with Anthropic Claude Haiku 3 and Supabase PostgreSQL Setup

This script demonstrates how to set up Vanna AI to work with:
- Anthropic's Claude Haiku 3 model for LLM functionality
- Supabase PostgreSQL database for querying
- Restricted access to only the public.v_bike_events view for security

Usage:
    python vanna_supabase_setup.py

Make sure to:
1. Fill in your credentials in the .env file
2. Activate the virtual environment: source venv/bin/activate
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


# Simple user resolver for demo
class SimpleUserResolver:
    """Simple user resolver that always returns a demo user."""

    async def resolve_user(self, request_context):
        """Resolve to a demo user."""
        from vanna import User

        return User(id="demo-user", username="demo", email="demo@example.com")


def validate_env_vars():
    """Validate that all required environment variables are set."""
    required_vars = {
        "ANTHROPIC_API_KEY": "Anthropic API Key",
        "SUPABASE_HOST": "Supabase Host",
        "SUPABASE_DATABASE": "Supabase Database Name",
        "SUPABASE_USER": "Supabase User",
        "SUPABASE_PASSWORD": "Supabase Password",
    }

    missing_vars = []
    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value or value.startswith("your_"):
            missing_vars.append(f"  - {var} ({description})")

    if missing_vars:
        print("❌ Error: Missing or incomplete environment variables in .env file:")
        print("\n".join(missing_vars))
        print("\nPlease edit the .env file and add your credentials.")
        sys.exit(1)

    print("✓ All required environment variables are set")


async def main():
    """Main function to set up and run Vanna AI."""

    print("=" * 60)
    print("Vanna AI - Anthropic Claude Haiku 3 + Supabase PostgreSQL")
    print("=" * 60)
    print()

    # Validate environment variables
    validate_env_vars()

    # Import Vanna components
    try:
        from vanna import Agent, AgentConfig, User
        from vanna.core.registry import ToolRegistry
        from vanna.integrations.anthropic import AnthropicLlmService
        from vanna.tools import RunSqlTool, VisualizeDataTool, LocalFileSystem
        from vanna.core.user import RequestContext
        from vanna.integrations.local.agent_memory import DemoAgentMemory

        # Import our custom restricted SQL runner
        from restricted_sql_runner import (
            RestrictedPostgresRunner,
            get_bike_events_view_schema,
        )
    except ImportError as e:
        print(f"❌ Error importing Vanna components: {e}")
        print(
            "Make sure you have activated the virtual environment and installed dependencies."
        )
        sys.exit(1)

    # Get configuration from environment
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-haiku-20240307")

    supabase_host = os.getenv("SUPABASE_HOST")
    supabase_port = int(os.getenv("SUPABASE_PORT", "5432"))
    supabase_database = os.getenv("SUPABASE_DATABASE")
    supabase_user = os.getenv("SUPABASE_USER")
    supabase_password = os.getenv("SUPABASE_PASSWORD")

    print(f"✓ Using Anthropic Model: {anthropic_model}")
    print(
        f"✓ Connecting to Supabase: {supabase_host}:{supabase_port}/{supabase_database}"
    )
    print("✓ Restricting queries to: public.v_bike_events view only")
    print()

    # Initialize Anthropic LLM Service
    llm = AnthropicLlmService(model=anthropic_model, api_key=anthropic_api_key)

    # Initialize Restricted PostgreSQL Runner for Supabase
    # This restricts all queries to only the public.v_bike_events view
    postgres_runner = RestrictedPostgresRunner(
        allowed_tables=["public.v_bike_events"],  # Only allow access to the view
        host=supabase_host,
        port=supabase_port,
        database=supabase_database,
        user=supabase_user,
        password=supabase_password,
        sslmode="require",  # Supabase requires SSL
    )

    # Try to fetch the v_bike_events view schema to provide context to the LLM
    print("Fetching v_bike_events view schema...")
    try:
        view_schema = await get_bike_events_view_schema(postgres_runner)
        print(view_schema)
    except Exception as e:
        print(f"⚠️  Could not fetch schema: {e}")
        view_schema = ""
    print()

    # Create shared FileSystem for storing charts and data
    file_system = LocalFileSystem(working_directory="./vanna_data")

    # Create SQL tool with file system
    sql_tool = RunSqlTool(sql_runner=postgres_runner, file_system=file_system)

    # Create tool registry and register tools
    tool_registry = ToolRegistry()
    tool_registry.register_local_tool(sql_tool, access_groups=[])

    # Register visualization tool for chart generation
    try:
        viz_tool = VisualizeDataTool(file_system=file_system)
        tool_registry.register_local_tool(viz_tool, access_groups=[])
        print("✓ Visualization tool enabled")
    except ImportError as e:
        print(f"⚠️  Visualization tool disabled: {e}")
        print("   Charts won't be generated. This is optional.")
    print()

    # Create user resolver (simple demo resolver)
    user_resolver = SimpleUserResolver()

    # Create agent memory
    agent_memory = DemoAgentMemory()

    # Create the agent
    agent = Agent(
        llm_service=llm,
        tool_registry=tool_registry,
        user_resolver=user_resolver,
        agent_memory=agent_memory,
        config=AgentConfig(stream_responses=True),
    )

    # Create a demo request context
    request_context = RequestContext(
        cookies={},
        metadata={"demo": True},
        remote_addr="127.0.0.1",
    )
    conversation_id = "vanna-supabase-demo"

    print("=" * 60)
    print("Vanna AI is ready!")
    print("=" * 60)
    print()
    print(
        "You can now ask questions about the public.v_bike_events view in natural language."
    )
    print("Examples:")
    print("  - 'How many events are in the database?'")
    print("  - 'Show me the latest 10 events'")
    print("  - 'What types of events are there?'")
    print("  - 'Show me events from yesterday'")
    print()
    print(
        "Note: Queries are restricted to the public.v_bike_events view only for security."
    )
    print("Type 'exit' or 'quit' to stop.")
    print("=" * 60)
    print()

    # Interactive loop
    while True:
        try:
            # Get user input
            user_message = input("You: ").strip()

            if not user_message:
                continue

            if user_message.lower() in ["exit", "quit"]:
                print("\nGoodbye!")
                break

            print("\nAssistant: ", end="", flush=True)

            # Send message to agent
            async for component in agent.send_message(
                request_context=request_context,
                message=user_message,
                conversation_id=conversation_id,
            ):
                # Handle different component types
                if (
                    hasattr(component, "simple_component")
                    and component.simple_component
                ):
                    if hasattr(component.simple_component, "text"):
                        print(component.simple_component.text, end="", flush=True)
                elif hasattr(component, "rich_component") and component.rich_component:
                    if (
                        hasattr(component.rich_component, "content")
                        and component.rich_component.content
                    ):
                        print(component.rich_component.content, end="", flush=True)
                elif hasattr(component, "content") and component.content:
                    print(component.content, end="", flush=True)

            print("\n")  # Add newline after response

        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            print("Please try again or type 'exit' to quit.\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nGoodbye!")
        sys.exit(0)
