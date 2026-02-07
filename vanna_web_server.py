"""
RadBlick Web Server with Chat Interface

This script sets up a FastAPI web server with Vanna's built-in chat UI.
Access the chat interface at http://localhost:8000

Usage:
    python vanna_web_server.py
"""

import os
import sys
import re
import uuid
from dotenv import load_dotenv

load_dotenv()

from db import init_pool
from auth import JwtUserResolver
from auth.service import verify_jwt, verify_password, create_jwt, get_jwt_secret
from auth.models import LoginRequest
from chat_persistence import PostgresConversationStore
from chat_persistence.routes import register_conversation_routes


# Custom System Prompt Builder with Schema Injection
class SchemaAwareSystemPromptBuilder:
    """System prompt builder that includes database schema information."""

    def __init__(self, schema_info: str, base_prompt: str = None):
        """Initialize with schema information.

        Args:
            schema_info: String describing the database schema
            base_prompt: Optional custom base prompt
        """
        self.schema_info = schema_info
        self.base_prompt = base_prompt

    async def build_system_prompt(self, user, tools):
        """Build system prompt with schema context."""
        from datetime import datetime

        tool_names = [tool.name for tool in tools]
        today_date = datetime.now().strftime("%Y-%m-%d")

        prompt_parts = [
            f"You are Vanna, an AI data analyst assistant. Today's date is {today_date}.",
            "",
            "=== DATABASE SCHEMA ===",
            self.schema_info,
            "",
            "=== IMPORTANT INSTRUCTIONS ===",
            "- You can ONLY query the table(s) listed above. Do not attempt to query other tables.",
            "- Use the EXACT column names as shown in the schema above.",
            "- If a user asks about a concept (like 'category'), match it to the closest column name in the schema.",
            "- Always verify column names against the schema before writing SQL.",
            "- If a question requires database facts (counts, trends, rankings, filters, 'last N days', etc.), you MUST use the run_sql tool and then answer using the returned results.",
            "- Do NOT respond with just a SQL query unless the user explicitly asks you to write SQL.",
            "- Use PostgreSQL syntax (avoid SQLite-style functions like date('now', ...)).",
            "- When creating charts with visualize_data, you can control labels with: labels={column_name: 'Nice Label'}, x_axis_title, y_axis_title, and title.",
            "",
            "=== RESPONSE GUIDELINES ===",
            "- When you execute a query, the raw result is shown to the user outside your response.",
            "- Focus on summarizing and interpreting results, not repeating raw data.",
            "- Use the available tools to help the user accomplish their goals.",
            "",
        ]

        if tools:
            prompt_parts.append(f"Available tools: {', '.join(tool_names)}")

        return "\n".join(prompt_parts)


class SqlOnlyToRunSqlMiddleware:
    """
    If the LLM returns only SQL text (instead of a tool call), convert it into a `run_sql` tool call.

    This mitigates cases where the model chooses to "answer with SQL" rather than actually querying.
    """

    _SQL_FENCE_RE = re.compile(r"```sql\s*(.*?)\s*```", re.IGNORECASE | re.DOTALL)

    def __init__(self, tool_name: str = "run_sql"):
        self.tool_name = tool_name

    def _extract_sql(self, content: str) -> str | None:
        text = (content or "").strip()
        if not text:
            return None

        # Prefer a single fenced ```sql``` block.
        m = self._SQL_FENCE_RE.fullmatch(text)
        if m:
            sql = m.group(1).strip().rstrip(";").strip()
            return sql or None

        # Or a bare SQL statement.
        lowered = text.lstrip().lower()
        if lowered.startswith(("select", "with")):
            return text.rstrip(";").strip()

        return None

    def _is_safe_readonly(self, sql: str) -> bool:
        # Very conservative: allow only SELECT/CTE and reject obvious DDL/DML tokens.
        lowered = sql.lower()
        if not lowered.lstrip().startswith(("select", "with")):
            return False

        banned = (
            "insert",
            "update",
            "delete",
            "drop",
            "alter",
            "create",
            "truncate",
            "grant",
            "revoke",
            "copy",
            "vacuum",
            "analyze",
        )
        return not any(re.search(rf"\\b{kw}\\b", lowered) for kw in banned)

    async def before_llm_request(self, request):
        return request

    async def after_llm_response(self, request, response):
        # Already a tool call; do nothing.
        if getattr(response, "tool_calls", None):
            return response

        content = getattr(response, "content", None) or ""
        sql = self._extract_sql(content)
        if not sql or not self._is_safe_readonly(sql):
            return response

        # Only convert if run_sql is actually available on this request.
        tool_names = {t.name for t in (getattr(request, "tools", None) or [])}
        if self.tool_name not in tool_names:
            return response

        from vanna.core.llm import LlmResponse
        from vanna.core.tool import ToolCall

        return LlmResponse(
            content="Running that query...",
            tool_calls=[
                ToolCall(
                    id=f"call_{self.tool_name}_{uuid.uuid4().hex[:8]}",
                    name=self.tool_name,
                    arguments={"sql": sql},
                )
            ],
        )


def fetch_schema_sync(host, port, database, user, password):
    """Fetch the v_bike_events schema synchronously at startup.

    Returns a tuple of (schema_string, schema_json):
    - schema_string: Human-readable string for LLM context
    - schema_json: Structured dict for frontend UI
    """
    import psycopg2

    schema_query = """
    SELECT 
        column_name,
        data_type,
        is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'v_bike_events'
    ORDER BY ordinal_position;
    """

    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            sslmode="require",
        )
        cur = conn.cursor()
        cur.execute(schema_query)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows:
            error_msg = "Table 'public.v_bike_events' not found or has no columns."
            return error_msg, {"tables": []}

        # Build string version for LLM
        schema_lines = ["Table: public.v_bike_events", "Columns:"]

        # Build JSON version for frontend
        columns = []
        for row in rows:
            col_name, data_type, nullable = row
            null_str = "" if nullable == "YES" else " (NOT NULL)"
            schema_lines.append(f"  - {col_name}: {data_type}{null_str}")

            columns.append(
                {"name": col_name, "type": data_type, "nullable": nullable == "YES"}
            )

        schema_string = "\n".join(schema_lines)
        schema_json = {
            "tables": [
                {"name": "v_bike_events", "schema": "public", "columns": columns}
            ]
        }

        return schema_string, schema_json

    except Exception as e:
        error_msg = f"Could not fetch schema: {e}"
        return error_msg, {"tables": [], "error": str(e)}


def validate_env_vars():
    """Validate that all required environment variables are set."""
    # Get the selected LLM provider
    llm_provider = os.getenv("LLM_PROVIDER", "anthropic").lower()

    # Common required vars
    required_vars = {
        "SUPABASE_HOST": "Supabase Host",
        "SUPABASE_DATABASE": "Supabase Database Name",
        "SUPABASE_USER": "Supabase User",
        "SUPABASE_PASSWORD": "Supabase Password",
    }

    # Provider-specific required vars
    if llm_provider == "gemini":
        required_vars["GOOGLE_API_KEY"] = "Google API Key (for Gemini)"
    elif llm_provider == "openai":
        required_vars["OPENAI_API_KEY"] = "OpenAI API Key"
    else:
        required_vars["ANTHROPIC_API_KEY"] = "Anthropic API Key"

    missing_vars = []
    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value or value.startswith("your_"):
            missing_vars.append(f"  - {var} ({description})")

    if missing_vars:
        print("Error: Missing or incomplete environment variables in .env file:")
        print("\n".join(missing_vars))
        print("\nPlease edit the .env file and add your credentials.")
        sys.exit(1)

    print(f"All required environment variables are set (using {llm_provider.upper()})")


def create_app(test_mode: bool = False):
    """Create and configure the FastAPI application."""

    from fastapi import FastAPI, Request, HTTPException
    from fastapi.responses import HTMLResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles

    def _require_auth(request: Request):
        token = request.cookies.get("session")
        if not token or not verify_jwt(token):
            raise HTTPException(status_code=401, detail="Unauthorized")

    def _dt_to_iso(value):
        if value is None:
            return None
        if hasattr(value, "isoformat"):
            return value.isoformat()
        return value

    def _register_home_api_routes(app: FastAPI):
        @app.get("/api/home/highlights")
        async def get_home_highlights(request: Request, window_days: int = 7):
            _require_auth(request)

            # Defensive clamping; keeps queries bounded.
            try:
                window_days_int = int(window_days)
            except Exception:
                window_days_int = 7
            window_days_int = max(1, min(30, window_days_int))

            from db import get_connection

            # Defaults; any optional sections can remain null without breaking the UI.
            payload = {
                "window_days": window_days_int,
                "current": {"new_events": 0, "open_events": 0, "closed_events": 0},
                "previous": {"new_events": 0, "open_events": 0, "closed_events": 0},
                "delta": {
                    "new_events_pct": None,
                    "open_events_pct": None,
                    "closed_events_pct": None,
                },
                "top_categories": [],
                "top_districts": [],
                "top_services": [],
            }

            try:
                with get_connection() as conn:
                    with conn.cursor() as cur:
                        # Current window: [now-window_days, now)
                        # Previous window: [now-2*window_days, now-window_days)
                        cur.execute(
                            """
                            WITH bounds AS (
                                SELECT
                                    now() AS now_ts,
                                    now() - (%s || ' days')::interval AS cur_start,
                                    now() - ((%s * 2) || ' days')::interval AS prev_start
                            )
                            SELECT
                                COUNT(*) FILTER (
                                    WHERE requested_at >= b.cur_start AND requested_at < b.now_ts
                                ) AS cur_new_events,
                                COUNT(*) FILTER (
                                    WHERE requested_at >= b.cur_start AND requested_at < b.now_ts AND lower(coalesce(status,'')) = 'open'
                                ) AS cur_open_events,
                                COUNT(*) FILTER (
                                    WHERE requested_at >= b.cur_start AND requested_at < b.now_ts AND lower(coalesce(status,'')) = 'closed'
                                ) AS cur_closed_events,
                                COUNT(*) FILTER (
                                    WHERE requested_at >= b.prev_start AND requested_at < b.cur_start
                                ) AS prev_new_events,
                                COUNT(*) FILTER (
                                    WHERE requested_at >= b.prev_start AND requested_at < b.cur_start AND lower(coalesce(status,'')) = 'open'
                                ) AS prev_open_events,
                                COUNT(*) FILTER (
                                    WHERE requested_at >= b.prev_start AND requested_at < b.cur_start AND lower(coalesce(status,'')) = 'closed'
                                ) AS prev_closed_events
                            FROM public.v_bike_events, bounds b;
                            """,
                            (window_days_int, window_days_int),
                        )
                        row = cur.fetchone() or (0, 0, 0, 0, 0, 0)
                        (
                            cur_new,
                            cur_open,
                            cur_closed,
                            prev_new,
                            prev_open,
                            prev_closed,
                        ) = row

                        payload["current"] = {
                            "new_events": int(cur_new or 0),
                            "open_events": int(cur_open or 0),
                            "closed_events": int(cur_closed or 0),
                        }
                        payload["previous"] = {
                            "new_events": int(prev_new or 0),
                            "open_events": int(prev_open or 0),
                            "closed_events": int(prev_closed or 0),
                        }

                        def pct(cur_val: int, prev_val: int):
                            if not prev_val:
                                return None
                            return (float(cur_val) - float(prev_val)) / float(prev_val) * 100.0

                        payload["delta"] = {
                            "new_events_pct": pct(
                                payload["current"]["new_events"],
                                payload["previous"]["new_events"],
                            ),
                            "open_events_pct": pct(
                                payload["current"]["open_events"],
                                payload["previous"]["open_events"],
                            ),
                            "closed_events_pct": pct(
                                payload["current"]["closed_events"],
                                payload["previous"]["closed_events"],
                            ),
                        }

                        cur.execute(
                            """
                            WITH bounds AS (
                                SELECT
                                    now() AS now_ts,
                                    now() - (%s || ' days')::interval AS cur_start
                            )
                            SELECT
                                coalesce(nullif(btrim(bike_issue_category::text), ''), 'Unknown') AS category,
                                COUNT(*) AS count
                            FROM public.v_bike_events, bounds b
                            WHERE requested_at >= b.cur_start AND requested_at < b.now_ts
                            GROUP BY 1
                            ORDER BY COUNT(*) DESC
                            LIMIT 5;
                            """,
                            (window_days_int,),
                        )
                        payload["top_categories"] = [
                            {"category": r[0], "count": int(r[1] or 0)}
                            for r in (cur.fetchall() or [])
                        ]

                        cur.execute(
                            """
                            WITH bounds AS (
                                SELECT
                                    now() AS now_ts,
                                    now() - (%s || ' days')::interval AS cur_start
                            )
                            SELECT
                                coalesce(nullif(btrim(district::text), ''), 'Unknown') AS district,
                                COUNT(*) AS count
                            FROM public.v_bike_events, bounds b
                            WHERE requested_at >= b.cur_start AND requested_at < b.now_ts
                            GROUP BY 1
                            ORDER BY COUNT(*) DESC
                            LIMIT 5;
                            """,
                            (window_days_int,),
                        )
                        payload["top_districts"] = [
                            {"district": r[0], "count": int(r[1] or 0)}
                            for r in (cur.fetchall() or [])
                        ]

                with get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            WITH bounds AS (
                                SELECT
                                    now() AS now_ts,
                                    now() - (%s || ' days')::interval AS cur_start
                            )
                            SELECT
                                coalesce(nullif(btrim(service_name::text), ''), 'Unknown') AS service_name,
                                COUNT(*) AS count
                            FROM public.v_bike_events, bounds b
                            WHERE requested_at >= b.cur_start AND requested_at < b.now_ts
                            GROUP BY 1
                            ORDER BY COUNT(*) DESC
                            LIMIT 5;
                            """,
                            (window_days_int,),
                        )
                        payload["top_services"] = [
                            {"service_name": r[0], "count": int(r[1] or 0)}
                            for r in (cur.fetchall() or [])
                        ]

                return payload

            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

        @app.get("/api/home/recent")
        async def get_home_recent(
            request: Request, window_days: int = 7, limit: int = 500
        ):
            _require_auth(request)

            try:
                window_days_int = int(window_days)
            except Exception:
                window_days_int = 7
            window_days_int = max(1, min(30, window_days_int))

            try:
                limit_int = int(limit)
            except Exception:
                limit_int = 500
            limit_int = max(1, min(5000, limit_int))

            from db import get_connection

            try:
                with get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            WITH bounds AS (
                                SELECT
                                    now() AS now_ts,
                                    now() - (%s || ' days')::interval AS cur_start
                            )
                            SELECT
                                service_request_id,
                                requested_at,
                                status,
                                district,
                                title,
                                bike_issue_category,
                                bike_issue_category_emoji,
                                bike_issue_emoji,
                                lat,
                                lon,
                                year,
                                sequence_number
                            FROM public.v_bike_events, bounds b
                            WHERE requested_at >= b.cur_start AND requested_at < b.now_ts
                            ORDER BY requested_at DESC
                            LIMIT %s;
                            """,
                            (window_days_int, limit_int),
                        )
                        columns = [desc[0] for desc in cur.description]
                        results = cur.fetchall()
                        rows = [dict(zip(columns, row)) for row in results]
                        for r in rows:
                            if r.get("requested_at"):
                                r["requested_at"] = r["requested_at"].isoformat()

                        return {
                            "window_days": window_days_int,
                            "limit": limit_int,
                            "count": len(rows),
                            "data": rows,
                        }
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    if test_mode:
        app = FastAPI(
            title="RadBlick Bike Insights (test)",
            description="Test-mode FastAPI app (skips env validation and LLM init).",
            version="test",
        )
        _register_home_api_routes(app)
        return app

    # Validate environment
    validate_env_vars()

    # Prefer a locally-built webcomponent bundle when available (for custom UI tweaks).
    local_components_dist = os.path.join(
        os.path.dirname(__file__), "vanna", "frontends", "webcomponent", "dist"
    )
    local_components_js = os.path.join(local_components_dist, "vanna-components.js")

    # Import Vanna components
    try:
        from vanna import Agent, AgentConfig
        from vanna.core.registry import ToolRegistry
        from vanna.tools import (
            RunSqlTool,
            VisualizeDataTool,
            LocalFileSystem,
        )
        from vanna.integrations.local.agent_memory import DemoAgentMemory
        from vanna.servers.fastapi.routes import register_chat_routes
        from vanna.servers.base import ChatHandler

        # Import our custom restricted SQL runner
        from restricted_sql_runner import RestrictedPostgresRunner
    except ImportError as e:
        print(f"Error importing components: {e}")
        print(
            "Make sure you have activated the virtual environment and installed dependencies."
        )
        sys.exit(1)

    # Get LLM provider configuration
    llm_provider = os.getenv("LLM_PROVIDER", "anthropic").lower()

    # Initialize LLM service based on provider
    if llm_provider == "gemini":
        try:
            from vanna.integrations.google import GeminiLlmService
        except ImportError as e:
            print(f"Error importing Gemini: {e}")
            print(
                "Install with: pip install 'vanna[gemini]' or pip install google-genai"
            )
            sys.exit(1)

        google_api_key = os.getenv("GOOGLE_API_KEY")
        gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-preview-05-20")

        print(f"Using Gemini Model: {gemini_model}")
        llm = GeminiLlmService(model=gemini_model, api_key=google_api_key)
    elif llm_provider == "openai":
        try:
            from vanna.integrations.openai import OpenAILlmService
        except ImportError as e:
            print(f"Error importing OpenAI: {e}")
            print("Install with: pip install 'vanna[openai]' or pip install openai")
            sys.exit(1)

        openai_api_key = os.getenv("OPENAI_API_KEY")
        openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        print(f"Using OpenAI Model: {openai_model}")
        llm = OpenAILlmService(model=openai_model, api_key=openai_api_key)
    else:
        from vanna.integrations.anthropic import AnthropicLlmService

        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
        anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-haiku-20240307")

        print(f"Using Anthropic Model: {anthropic_model}")
        llm = AnthropicLlmService(model=anthropic_model, api_key=anthropic_api_key)

    supabase_host = os.getenv("SUPABASE_HOST")
    supabase_port = int(os.getenv("SUPABASE_PORT", "5432"))
    supabase_database = os.getenv("SUPABASE_DATABASE")
    supabase_user = os.getenv("SUPABASE_USER")
    supabase_password = os.getenv("SUPABASE_PASSWORD")

    print(
        f"Connecting to Supabase: {supabase_host}:{supabase_port}/{supabase_database}"
    )
    print("Restricting queries to: public.v_bike_events view only")

    # Fetch database schema at startup for context injection
    print("Fetching database schema...")
    schema_string, schema_json = fetch_schema_sync(
        host=supabase_host,
        port=supabase_port,
        database=supabase_database,
        user=supabase_user,
        password=supabase_password,
    )
    print(f"Schema loaded:\n{schema_string}")

    # Create schema-aware system prompt builder
    system_prompt_builder = SchemaAwareSystemPromptBuilder(schema_info=schema_string)

    # Initialize Restricted PostgreSQL Runner for Supabase
    postgres_runner = RestrictedPostgresRunner(
        allowed_tables=["public.v_bike_events"],
        host=supabase_host,
        port=supabase_port,
        database=supabase_database,
        user=supabase_user,
        password=supabase_password,
        sslmode="require",
    )

    # Create shared FileSystem for storing charts and data
    data_dir = os.getenv("VANNA_DATA_DIR")
    if not data_dir:
        data_dir = "/tmp/vanna_data" if os.getenv("VERCEL") else "./vanna_data"
    os.makedirs(data_dir, exist_ok=True)
    file_system = LocalFileSystem(working_directory=data_dir)

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

    # Initialize database connection pool for auth and chat persistence
    print("Initializing database connection pool...")
    init_pool()
    conversation_store = PostgresConversationStore()

    # Initialize JWT secret (warns if not set in env)
    get_jwt_secret()

    # Create user resolver and agent memory
    user_resolver = JwtUserResolver()
    agent_memory = DemoAgentMemory()

    # Configure UI features to show SQL queries to all users
    from vanna.core.agent.config import UiFeatures, UiFeature

    ui_features = UiFeatures(
        feature_group_access={
            # Allow all users to see these features (empty list = accessible to all)
            UiFeature.UI_FEATURE_SHOW_TOOL_NAMES: [],  # Show tool names (e.g., "run_sql")
            UiFeature.UI_FEATURE_SHOW_TOOL_ARGUMENTS: [],  # Show SQL query text
            UiFeature.UI_FEATURE_SHOW_TOOL_ERROR: [],  # Show error messages
            UiFeature.UI_FEATURE_SHOW_TOOL_INVOCATION_MESSAGE_IN_CHAT: [],  # Show in chat
            UiFeature.UI_FEATURE_SHOW_MEMORY_DETAILED_RESULTS: [],  # Show memory results
        }
    )

    # Create the agent with schema-aware system prompt and SQL visibility enabled
    agent = Agent(
        llm_service=llm,
        tool_registry=tool_registry,
        user_resolver=user_resolver,
        agent_memory=agent_memory,
        conversation_store=conversation_store,
        system_prompt_builder=system_prompt_builder,
        llm_middlewares=[SqlOnlyToRunSqlMiddleware()],
        config=AgentConfig(
            stream_responses=True,
            ui_features=ui_features,
            max_tool_iterations=25,  # Increased from default 10 for complex queries
        ),
    )

    # Create FastAPI app
    app = FastAPI(
        title="RadBlick Bike Insights",
        description="Natural language interface to query the public.v_bike_events view",
        version="1.0.0",
    )

    # Store schema JSON in app state for access in routes
    app.state.schema_json = schema_json

    component_script_tag = (
        '<script type="module" src="https://img.vanna.ai/vanna-components.js"></script>'
    )
    if os.path.exists(local_components_js):
        app.mount(
            "/static", StaticFiles(directory=local_components_dist), name="static"
        )
        component_script_tag = (
            '<script type="module" src="/static/vanna-components.js"></script>'
        )

    # Mount dashboard static files
    dashboard_dist = os.path.join(os.path.dirname(__file__), "dashboards")
    if os.path.exists(dashboard_dist):
        app.mount(
            "/dashboards", StaticFiles(directory=dashboard_dist), name="dashboards"
        )

    # Mount app assets (brand logo, etc.)
    assets_dir = os.path.join(os.path.dirname(__file__), "app_assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # ── Auth middleware: protect Vanna chat endpoints ──
    @app.middleware("http")
    async def auth_middleware(request: Request, call_next):
        if request.url.path.startswith("/api/vanna/v2/"):
            token = request.cookies.get("session")
            if not token or not verify_jwt(token):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Not authenticated"},
                )
        response = await call_next(request)
        return response

    # ── Auth routes ──
    @app.post("/api/auth/login")
    async def login(body: LoginRequest):
        from db import get_connection

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email, password_hash, display_name, role, is_active "
                    "FROM app_users WHERE email = %s;",
                    (body.email,),
                )
                row = cur.fetchone()

        if not row:
            return JSONResponse(
                status_code=401, content={"detail": "Invalid email or password"}
            )

        user_id, email, password_hash, display_name, role, is_active = row

        if not is_active:
            return JSONResponse(
                status_code=401, content={"detail": "Account is disabled"}
            )

        if not verify_password(body.password, password_hash):
            return JSONResponse(
                status_code=401, content={"detail": "Invalid email or password"}
            )

        # Update last_login_at
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE app_users SET last_login_at = now() WHERE id = %s;",
                    (str(user_id),),
                )

        token = create_jwt(str(user_id), email, display_name)
        response = JSONResponse(
            content={
                "user": {
                    "id": str(user_id),
                    "email": email,
                    "display_name": display_name,
                    "role": role,
                }
            }
        )
        response.set_cookie(
            key="session",
            value=token,
            httponly=True,
            samesite="lax",
            max_age=72 * 3600,  # 72 hours
            path="/",
        )
        return response

    @app.post("/api/auth/logout")
    async def logout():
        response = JSONResponse(content={"status": "logged_out"})
        response.delete_cookie(key="session", path="/")
        return response

    @app.get("/api/auth/me")
    async def me(request: Request):
        token = request.cookies.get("session")
        if not token:
            return JSONResponse(
                status_code=401, content={"detail": "Not authenticated"}
            )
        payload = verify_jwt(token)
        if not payload:
            return JSONResponse(
                status_code=401, content={"detail": "Invalid or expired session"}
            )
        return {
            "id": payload["sub"],
            "email": payload["email"],
            "display_name": payload.get("name", ""),
        }

    # ── Register Vanna chat routes ──
    chat_handler = ChatHandler(agent)
    register_chat_routes(app, chat_handler, config={"serve_index": False})

    # ── Register conversation history routes ──
    register_conversation_routes(app, conversation_store)

    # ── Dashboard API routes ──
    @app.get("/api/dashboards/bike-events/data")
    async def get_bike_events_data(request: Request):
        """Fetch all bike events from v_bike_events view."""
        token = request.cookies.get("session")
        if not token or not verify_jwt(token):
            raise HTTPException(status_code=401, detail="Unauthorized")

        try:
            from db import get_connection

            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT
                            service_request_id,
                            requested_at,
                            status,
                            category,
                            subcategory,
                            subcategory2,
                            service_name,
                            district,
                            zip_code,
                            city,
                            street,
                            house_number,
                            address_string,
                            title,
                            description,
                            media_path,
                            lat,
                            lon,
                            bike_confidence,
                            bike_issue_category,
                            bike_issue_confidence,
                            year,
                            sequence_number,
                            day,
                            week,
                            month,
                            cat_path,
                            backlog_bucket,
                            bike_issue_category_emoji,
                            bike_issue_emoji
                        FROM public.v_bike_events
                        ORDER BY requested_at DESC
                    """)

                    columns = [desc[0] for desc in cur.description]
                    results = cur.fetchall()

                    events = [dict(zip(columns, row)) for row in results]

                    # Convert datetime objects to ISO strings
                    for event in events:
                        if event.get("requested_at"):
                            event["requested_at"] = event["requested_at"].isoformat()

                    return {"data": events, "count": len(events)}

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    @app.get("/api/dashboards/bike-events/event/{service_request_id}")
    async def get_bike_event_by_id(service_request_id: str, request: Request):
        """Fetch a single bike event by ID."""
        token = request.cookies.get("session")
        if not token or not verify_jwt(token):
            raise HTTPException(status_code=401, detail="Unauthorized")

        try:
            from db import get_connection

            with get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT * FROM public.v_bike_events
                        WHERE service_request_id = %s
                    """,
                        (service_request_id,),
                    )

                    columns = [desc[0] for desc in cur.description]
                    row = cur.fetchone()

                    if not row:
                        raise HTTPException(status_code=404, detail="Event not found")

                    event = dict(zip(columns, row))
                    if event.get("requested_at"):
                        event["requested_at"] = event["requested_at"].isoformat()

                    return event

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # ── Home API routes ──
    _register_home_api_routes(app)

    # ── Home page with login + chat UI ──
    @app.get("/", response_class=HTMLResponse)
    async def home(request: Request):
        token = request.cookies.get("session")
        if not token or not verify_jwt(token):
            login_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RadBlick - Sign In</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #f8fafc;
            --panel: #ffffff;
            --border: #e2e8f0;
            --text: #0f172a;
            --muted: #64748b;
            --accent: #2563eb;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Manrope", "Segoe UI", system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
        }
        .login-screen {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
        }
        .login-card {
            width: min(460px, 92vw);
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 28px;
            box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
        }
        .login-card h2 {
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 6px;
        }
        .login-card p {
            font-size: 14px;
            color: var(--muted);
            margin-bottom: 18px;
        }

        .login-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 10px;
        }

        .login-brand-name {
            font-size: 18px;
            font-weight: 800;
            color: var(--text);
            letter-spacing: -0.02em;
            line-height: 1.1;
        }

        .login-brand-sub {
            margin-top: 2px;
            font-size: 12px;
            color: var(--muted);
            line-height: 1.1;
        }

        .login-note {
            margin: 0 0 16px 0;
            color: var(--muted);
            font-size: 13px;
        }
        .login-card input {
            width: 100%;
            padding: 12px 14px;
            border-radius: 12px;
            border: 1px solid var(--border);
            margin-bottom: 12px;
            font-size: 14px;
            font-family: inherit;
        }
        .login-card input:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }
        .login-card .error {
            color: #e11d48;
            font-size: 13px;
            margin-bottom: 10px;
            display: none;
        }
        .btn {
            width: 100%;
            padding: 10px 16px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            border: 1px solid transparent;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
        }
        .btn.primary {
            background: var(--accent);
            color: #fff;
            box-shadow: 0 12px 24px -14px rgba(37, 99, 235, 0.6);
        }
        .btn.primary:hover {
            filter: brightness(0.98);
        }
    </style>
</head>
<body>
    <div class="login-screen">
        <div class="login-card">
            <div class="login-brand">
                <img class="login-logo" src="/assets/radblick-mark.svg" alt="RadBlick logo"
                     onerror="this.onerror=null; this.src='/assets/concept4-civic_seal.png';" />
                <div>
                    <div class="login-brand-name">RadBlick</div>
                    <div class="login-brand-sub">Bike Insights</div>
                </div>
            </div>
            <p class="login-note">Sign in to continue</p>
            <div class="error" id="login-error"></div>
            <input type="email" id="login-email" placeholder="Email" autocomplete="email">
            <input type="password" id="login-password" placeholder="Password" autocomplete="current-password">
            <button type="button" class="btn primary" id="login-btn">Sign In</button>
        </div>
    </div>
    <script>
    if (window.location.hostname === '0.0.0.0') {
        window.location.replace(window.location.href.replace('0.0.0.0', 'localhost'));
    }
    async function doLogin() {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');
        const btn = document.getElementById('login-btn');
        errEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        try {
            const r = await fetch('/api/auth/login', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email, password})
            });
            const data = await r.json();
            if (r.ok) {
                const me = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
                if (me.ok) {
                    window.location.href = '/';
                    return;
                }
                errEl.textContent = 'Login succeeded but session was not set. Please check cookies.';
                errEl.style.display = 'block';
                return;
            }
            errEl.textContent = data.detail || 'Login failed';
            errEl.style.display = 'block';
        } catch (e) {
            errEl.textContent = 'Connection error';
            errEl.style.display = 'block';
        }
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
    document.getElementById('login-btn').addEventListener('click', doLogin);
    document.getElementById('login-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    </script>
</body>
</html>"""
            return login_html

        html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RadBlick - Bike Insights</title>
    __COMPONENT_SCRIPT__
    <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    />
    <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css"
    />
    <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"
    />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #f8fafc;
            --panel: #ffffff;
            --border: #e2e8f0;
            --text: #0f172a;
            --muted: #64748b;
            --accent: #2563eb;
            --accent-soft: rgba(37, 99, 235, 0.1);
            --shadow-sm: 0 8px 24px rgba(15, 23, 42, 0.08);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Manrope", "Segoe UI", system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
        }

        .app {
            min-height: 100vh;
        }

        .shell {
            display: none;
            min-height: 100vh;
        }

        .shell.active {
            display: flex;
            flex-direction: row;
            min-height: 100vh;
        }

        .btn {
            border-radius: 999px;
            padding: 10px 18px;
            font-size: 14px;
            font-weight: 600;
            border: 1px solid transparent;
            background: transparent;
            color: var(--text);
            cursor: pointer;
        }

        .btn.ghost {
            border-color: var(--border);
            color: var(--muted);
            background: var(--panel);
        }

        .btn.primary {
            background: var(--accent);
            color: #fff;
            box-shadow: 0 12px 24px -14px rgba(37, 99, 235, 0.6);
        }

        .sidebar {
            width: 280px;
            background: var(--panel);
            border-right: 1px solid var(--border);
            padding: 20px 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            height: 100vh;
            position: sticky;
            top: 0;
        }

        .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 4px 4px 12px;
            border-bottom: 1px solid var(--border);
        }

        .brand-mark {
            width: 48px;
            height: 48px;
            border-radius: 16px;
            display: grid;
            place-items: center;
            box-shadow: var(--shadow-sm);
            background: #fff;
            border: 1px solid var(--border);
            overflow: hidden;
            padding: 4px;
        }

        .brand-mark img {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }

        .brand-name {
            font-size: 18px;
            font-weight: 700;
        }

        .brand-subtitle {
            font-size: 12px;
            color: var(--muted);
        }

        .sidebar-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
        }

        .chat-actions {
            display: none;
            flex-direction: column;
            gap: 10px;
            padding: 8px 4px 12px;
            border-bottom: 1px solid var(--border);
        }

        .chat-actions-title {
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
            padding: 4px 4px 0;
        }

        .chat-actions .btn {
            width: 100%;
            border-radius: 12px;
        }

        .sidebar-tabs {
            display: flex;
            gap: 6px;
            padding: 4px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--bg);
        }

        .sidebar-tab {
            flex: 1;
            border: none;
            border-radius: 8px;
            padding: 8px 10px;
            background: transparent;
            font-size: 12px;
            font-weight: 600;
            color: var(--muted);
            cursor: pointer;
        }

        .sidebar-tab.active {
            background: var(--panel);
            color: var(--text);
            box-shadow: var(--shadow-sm);
        }

        .sidebar-list {
            flex: 1;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-right: 4px;
        }

        .conv-item {
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid transparent;
            cursor: pointer;
            background: transparent;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .conv-item:hover {
            background: var(--bg);
            border-color: var(--border);
        }

        .conv-item.active {
            background: var(--accent-soft);
            border-color: var(--accent);
        }

        .conv-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }

        .conv-title {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .conv-time {
            font-size: 12px;
            color: var(--muted);
        }

        .conv-delete {
            border: none;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
            font-size: 16px;
        }

        .dashboard-card {
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--border);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
        }

        .dashboard-card:hover {
            border-color: var(--accent);
            box-shadow: var(--shadow-sm);
            transform: translateY(-1px);
        }

        .dashboard-card.active {
            border-color: var(--accent);
            background: var(--accent-soft);
        }

        .dashboard-icon {
            width: 40px;
            height: 40px;
            border-radius: 12px;
            background: var(--bg);
            display: grid;
            place-items: center;
            font-size: 18px;
        }

        .dashboard-info {
            min-width: 0;
        }

        .dashboard-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
        }

        .dashboard-desc {
            font-size: 12px;
            color: var(--muted);
        }

        .sidebar-footer {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding-top: 12px;
            border-top: 1px solid var(--border);
        }

        .main {
            flex: 1;
            display: flex;
            justify-content: center;
            padding: 32px 32px 56px;
            height: 100vh;
            overflow: hidden;
        }

        .main.dashboard-mode {
            overflow: auto;
        }

        .chat-wrapper {
            width: 100%;
            max-width: 980px;
            display: flex;
            height: 100%;
        }

        .main.dashboard-mode .chat-wrapper {
            max-width: none;
            width: 100%;
        }

        .main.dashboard-mode {
            padding: 24px 24px 40px;
        }

        #dashboard-root {
            width: 100%;
        }

        /* ── Home view ── */
        .home-wrapper {
            width: 100%;
            max-width: 1100px;
            height: 100%;
            overflow: auto;
            padding-right: 4px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .home-header h1 {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.01em;
            margin-bottom: 4px;
        }

        .home-header p {
            font-size: 13px;
            color: var(--muted);
        }

        .home-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
        }

        .home-card {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 14px 14px 12px;
            box-shadow: var(--shadow-sm);
        }

        .home-card h3 {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
            margin-bottom: 10px;
        }

        .home-card.metric {
            text-align: center;
        }

        .home-metric-value {
            font-size: 30px;
            font-weight: 900;
            letter-spacing: -0.03em;
        }

        .home-delta {
            font-size: 12px;
            font-weight: 700;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid var(--border);
            background: var(--bg);
            color: var(--muted);
            white-space: nowrap;
        }

        .home-delta.neutral {
            border-color: var(--border);
            background: var(--bg);
            color: var(--muted);
        }

        .home-delta.pos-low {
            border-color: rgba(16, 185, 129, 0.35);
            background: rgba(16, 185, 129, 0.08);
            color: #065f46;
        }

        .home-delta.pos-med {
            border-color: rgba(16, 185, 129, 0.55);
            background: rgba(16, 185, 129, 0.14);
            color: #065f46;
        }

        .home-delta.pos-high {
            border-color: rgba(16, 185, 129, 0.75);
            background: rgba(16, 185, 129, 0.22);
            color: #064e3b;
        }

        .home-delta.neg-low {
            border-color: rgba(239, 68, 68, 0.35);
            background: rgba(239, 68, 68, 0.08);
            color: #991b1b;
        }

        .home-delta.neg-med {
            border-color: rgba(239, 68, 68, 0.55);
            background: rgba(239, 68, 68, 0.14);
            color: #991b1b;
        }

        .home-delta.neg-high {
            border-color: rgba(239, 68, 68, 0.75);
            background: rgba(239, 68, 68, 0.22);
            color: #7f1d1d;
        }

        .home-submetrics {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 12px;
        }

        .home-submetric {
            border-radius: 14px;
            border: 1px solid var(--border);
            background: var(--bg);
            padding: 10px 10px 9px;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .home-submetric .k {
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 900;
            color: var(--muted);
        }

        .home-submetric .v {
            font-size: 16px;
            font-weight: 900;
            font-variant-numeric: tabular-nums;
        }

        .home-toplist {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .home-topitem {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            font-size: 13px;
        }

        .home-topitem .label {
            color: var(--text);
            font-weight: 600;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .home-topitem .count {
            color: var(--muted);
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }

        .home-section {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .home-section-title {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
        }

        .home-map {
            width: 100%;
            height: 440px;
            border-radius: 16px;
            border: 1px solid var(--border);
            overflow: hidden;
            box-shadow: var(--shadow-sm);
            background: var(--panel);
        }

        .home-emoji-marker {
            width: 28px;
            height: 28px;
            border-radius: 12px;
            display: grid;
            place-items: center;
            font-size: 16px;
            font-weight: 900;
            box-shadow: 0 10px 22px rgba(15, 23, 42, 0.18);
            user-select: none;
        }

        .leaflet-tooltip.home-tooltip {
            border-radius: 12px;
            border: 1px solid rgba(226, 232, 240, 0.95);
            box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
            padding: 10px 10px 9px;
            background: rgba(255, 255, 255, 0.98);
            color: #0f172a;
            font-family: "Manrope", "Segoe UI", system-ui, -apple-system, sans-serif;
        }

        .leaflet-tooltip.home-tooltip .t-head {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 800;
            font-size: 13px;
            margin-bottom: 6px;
        }

        .leaflet-tooltip.home-tooltip .t-desc {
            font-size: 12px;
            color: #475569;
            margin-bottom: 6px;
            max-width: 260px;
        }

        .leaflet-tooltip.home-tooltip .t-hint {
            font-size: 11px;
            color: #64748b;
            font-style: italic;
        }

        .home-note {
            font-size: 12px;
            color: var(--muted);
        }

        .home-feed {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .home-feed-item {
            padding: 12px;
            border-radius: 14px;
            border: 1px solid var(--border);
            background: var(--panel);
            cursor: pointer;
            transition: transform 120ms ease, border-color 120ms ease;
        }

        .home-feed-item.status-open {
            background: rgba(16, 185, 129, 0.08);
            border-color: rgba(16, 185, 129, 0.22);
        }

        .home-feed-item.status-closed {
            background: rgba(239, 68, 68, 0.07);
            border-color: rgba(239, 68, 68, 0.20);
        }

        .home-feed-item:hover {
            border-color: var(--accent);
            transform: translateY(-1px);
        }

        .home-feed-title {
            font-size: 13px;
            font-weight: 800;
            margin-bottom: 4px;
        }

        .home-feed-meta {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            font-size: 12px;
            color: var(--muted);
        }

        /* Modal: uses the Bike Events dashboard modal design (Tailwind CSS in a shadow root). */

        .home-loading {
            color: var(--muted);
            font-size: 13px;
            padding: 10px 2px;
        }

        .home-sidebar-note {
            padding: 10px 12px;
            border-radius: 12px;
            border: 1px solid var(--border);
            background: var(--bg);
            font-size: 12px;
            color: var(--muted);
            line-height: 1.4;
        }

        @media (max-width: 920px) {
            .home-grid {
                grid-template-columns: 1fr;
            }
        }

        vanna-chat {
            width: 100%;
            height: 100%;
            min-height: 600px;
        }

        @media (max-width: 720px) {
            .shell.active {
                flex-direction: column;
            }

            .sidebar {
                width: 100%;
                height: auto;
                position: relative;
                border-right: none;
                border-bottom: 1px solid var(--border);
            }

            .btn {
                width: 100%;
            }

            .main {
                padding: 24px 16px 40px;
            }

            .home-map {
                height: 360px;
            }
        }
    </style>
</head>
	<body>
	    <div class="app">
	        <div id="logged-in" class="shell">
	            <aside class="sidebar">
	                    <div class="sidebar-brand">
	                    <div class="brand-mark"><img src="/assets/radblick-mark.svg" alt="RadBlick logo" onerror="this.onerror=null; this.src='/assets/concept4-civic_seal.png';" /></div>
	                    <div>
	                        <div class="brand-name">RadBlick</div>
	                        <div class="brand-subtitle">Bike Insights</div>
	                    </div>
	                </div>
	                <div class="sidebar-title">Workspace</div>
	                <div class="sidebar-tabs">
	                    <button class="sidebar-tab active" id="tab-home" type="button">Home</button>
	                    <button class="sidebar-tab" id="tab-chats" type="button">Chats</button>
	                    <button class="sidebar-tab" id="tab-dashboards" type="button">Dashboards</button>
	                </div>
	                <div class="sidebar-list" id="home-list">
	                    <div class="home-sidebar-note">
	                        Weekly highlights for Cologne bike-related reports.
	                        <br><br>
	                        Use the tabs to jump into Chats or the Bike Events dashboard.
	                    </div>
	                </div>
	                <div class="chat-actions" id="chat-actions">
	                    <div class="chat-actions-title">Chats</div>
	                    <button class="btn primary" id="sidebar-new-chat" type="button">New chat</button>
	                </div>
	                <div class="sidebar-list" id="conv-list" style="display: none;"></div>
	                <div class="sidebar-list" id="dashboard-list" style="display: none;">
	                    <div class="dashboard-card" data-dashboard="bike-events">
	                        <div class="dashboard-icon">🚴</div>
	                        <div class="dashboard-info">
	                            <div class="dashboard-name">Bike Events</div>
	                            <div class="dashboard-desc">Cologne infrastructure issues</div>
	                        </div>
	                    </div>
	                </div>
	                <div class="sidebar-footer">
	                    <button class="btn primary" id="logout-btn">Log out</button>
	                </div>
	            </aside>

            <main class="main" id="main">
                <div id="chat-wrapper" class="chat-wrapper"></div>
            </main>
        </div>
    </div>

    <script>
    if (window.location.hostname === '0.0.0.0') {
        window.location.replace(window.location.href.replace('0.0.0.0', 'localhost'));
    }
    let currentUser = null;
    let currentConvId = null;
    let chatPollTimer = null;
    let currentView = 'home';
    let dashboardRoot = null;
    let homeMap = null;
    let homeCluster = null;
    let homeAbort = null;
    let homeModalHost = null;
    let homeModalEscHandler = null;
	    let bikeEventsCssText = null;

	    const elLoggedIn = document.getElementById('logged-in');
	    const elMain = document.getElementById('main');
	    const elHomeList = document.getElementById('home-list');
	    const elConvList = document.getElementById('conv-list');
	    const elDashboardList = document.getElementById('dashboard-list');
	    const elChatActions = document.getElementById('chat-actions');
	    const elTabHome = document.getElementById('tab-home');
	    const elTabChats = document.getElementById('tab-chats');
	    const elTabDashboards = document.getElementById('tab-dashboards');

	    function setLoggedIn() {
	        elLoggedIn.classList.add('active');
	    }

	    function setTab(tab) {
	        // Chats-specific controls should only appear within the Chats section.
	        if (elChatActions) {
	            elChatActions.style.display = tab === 'chats' ? 'flex' : 'none';
	        }
	        if (tab === 'home') {
	            elTabHome.classList.add('active');
	            elTabChats.classList.remove('active');
	            elTabDashboards.classList.remove('active');
	            elHomeList.style.display = 'flex';
	            elDashboardList.style.display = 'none';
	            elConvList.style.display = 'none';
	        } else if (tab === 'dashboards') {
	            elTabHome.classList.remove('active');
	            elTabDashboards.classList.add('active');
	            elTabChats.classList.remove('active');
	            elTabHome.classList.remove('active');
	            elDashboardList.style.display = 'flex';
	            elConvList.style.display = 'none';
	            elHomeList.style.display = 'none';
	        } else {
	            elTabHome.classList.remove('active');
	            elTabChats.classList.add('active');
	            elTabDashboards.classList.remove('active');
	            elTabHome.classList.remove('active');
	            elConvList.style.display = 'flex';
	            elDashboardList.style.display = 'none';
	            elHomeList.style.display = 'none';
	        }
	    }

    function stopChatPolling() {
        if (chatPollTimer) clearInterval(chatPollTimer);
        chatPollTimer = null;
    }

    // ── Auth ──
    async function checkAuth() {
        try {
            const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
            if (r.ok) {
                currentUser = await r.json();
                await showHomeView();
            } else {
                window.location.href = '/';
            }
        } catch(e) {
            window.location.href = '/';
        }
    }

    async function showChatView() {
        setLoggedIn();
        setTab('chats');
        stopChatPolling();
        const convs = await loadConversations();
        const targetId = currentConvId || (convs.length ? convs[0].id : null);
        if (targetId) {
            await switchConv(targetId, { skipListReload: true });
        } else {
            await newChat();
        }
        await loadConversations();
        chatPollTimer = setInterval(loadConversations, 5000);
    }

    function destroyHomeMap() {
        if (homeMap) {
            try {
                homeMap.off();
                homeMap.remove();
            } catch(e) {}
            homeMap = null;
            homeCluster = null;
        }
    }

    function closeHomeModal() {
        if (!homeModalHost) return;
        homeModalHost.style.display = 'none';
        try {
            const root = homeModalHost.shadowRoot;
            const panel = root && root.getElementById('home-dashboard-modal-panel');
            if (panel) panel.innerHTML = '';
        } catch(e) {}
        if (homeModalEscHandler) {
            document.removeEventListener('keydown', homeModalEscHandler);
            homeModalEscHandler = null;
        }
    }

    async function ensureBikeEventsCssLoaded() {
        if (bikeEventsCssText) return bikeEventsCssText;
        const r = await fetch('/dashboards/bike-events/dist/bike-events.css', { credentials: 'include' });
        if (!r.ok) throw new Error('Failed to load dashboard CSS');
        bikeEventsCssText = await r.text();
        return bikeEventsCssText;
    }

    async function ensureHomeModal() {
        if (homeModalHost) return homeModalHost;
        const host = document.createElement('div');
        host.id = 'home-dashboard-modal-host';
        host.style.position = 'fixed';
        host.style.inset = '0';
        host.style.zIndex = '9999';
        host.style.display = 'none';
        host.style.pointerEvents = 'auto';
        const shadow = host.attachShadow({ mode: 'open' });

        const cssText = await ensureBikeEventsCssLoaded();
        const style = document.createElement('style');
        style.textContent = cssText;

        // Basic host reset inside shadow root so Tailwind styles apply predictably.
        const base = document.createElement('style');
        base.textContent = `
            :host { all: initial; }
            * { box-sizing: border-box; }
        `;

        const wrap = document.createElement('div');
        wrap.id = 'home-dashboard-modal-wrap';
        wrap.innerHTML = `
            <div class="relative z-[9999]">
                <div id="home-dashboard-modal-backdrop" class="fixed inset-0 bg-black/30 backdrop-blur-sm"></div>
                <div class="fixed inset-0 flex items-center justify-center p-4">
                    <div id="home-dashboard-modal-panel" class="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto"></div>
                </div>
            </div>
        `;

        shadow.appendChild(base);
        shadow.appendChild(style);
        shadow.appendChild(wrap);

        shadow.getElementById('home-dashboard-modal-backdrop')?.addEventListener('click', closeHomeModal);

        document.body.appendChild(host);
        homeModalHost = host;
        return homeModalHost;
    }

    function destroyHomeView() {
        if (homeAbort) {
            try { homeAbort.abort(); } catch(e) {}
            homeAbort = null;
        }
        closeHomeModal();
        destroyHomeMap();
    }

    function clearDashboardSelection() {
        document.querySelectorAll('.dashboard-card').forEach(c => c.classList.remove('active'));
    }

    function selectDashboardCard(dashboardId) {
        clearDashboardSelection();
        const card = document.querySelector('.dashboard-card[data-dashboard="' + dashboardId + '"]');
        if (card) card.classList.add('active');
    }

    async function showHomeView() {
        currentView = 'home';
        setLoggedIn();
        setTab('home');
        stopChatPolling();

        if (dashboardRoot) {
            dashboardRoot.unmount();
            dashboardRoot = null;
        }
        if (elMain) {
            elMain.classList.remove('dashboard-mode');
        }
        clearDashboardSelection();

        const wrapper = document.getElementById('chat-wrapper');
        destroyHomeView();
        wrapper.className = 'home-wrapper';
        wrapper.innerHTML = `
            <div class="home-header">
                <h1>What happened recently in Cologne bike-related reports?</h1>
                <p>Rolling 7 days versus previous 7 days, plus a map and newest events.</p>
            </div>
            <div class="home-grid" id="home-highlights">
                <div class="home-card"><h3>New bike-related reports (7d)</h3><div class="home-loading">Loading...</div></div>
                <div class="home-card"><h3>Top issue categories (7d)</h3><div class="home-loading">Loading...</div></div>
                <div class="home-card"><h3>Top districts (7d)</h3><div class="home-loading">Loading...</div></div>
                <div class="home-card"><h3>Top services (7d)</h3><div class="home-loading">Loading...</div></div>
            </div>
            <div class="home-section">
                <div class="home-section-title">Map (last 7 days)</div>
                <div class="home-note" id="home-map-note"></div>
                <div id="home-map" class="home-map"></div>
            </div>
            <div class="home-section">
                <div class="home-section-title">Newest events</div>
                <div class="home-feed" id="home-feed"><div class="home-loading">Loading...</div></div>
            </div>
        `;

        homeAbort = new AbortController();
        const signal = homeAbort.signal;
        try {
            const [highR, recentR] = await Promise.all([
                fetch('/api/home/highlights?window_days=7', { credentials: 'include', signal }),
                fetch('/api/home/recent?window_days=7&limit=2000', { credentials: 'include', signal }),
            ]);
            if (!highR.ok) throw new Error('highlights failed');
            if (!recentR.ok) throw new Error('recent failed');

            const highlights = await highR.json();
            const recent = await recentR.json();

            renderHomeHighlights(highlights);
            renderHomeFeed(recent.data || []);
            initHomeMap(recent.data || []);

            // If fewer than 20 events exist in the last 7d, backfill the feed with a wider window.
            if ((recent.data || []).length < 20) {
                try {
                    const r2 = await fetch('/api/home/recent?window_days=365&limit=20', { credentials: 'include', signal });
                    if (r2.ok) {
                        const more = await r2.json();
                        renderHomeFeed(more.data || []);
                    }
                } catch(e) {}
            }
        } catch (e) {
            const el = document.getElementById('home-feed');
            if (el) el.innerHTML = '<div class="home-loading">Failed to load Home data.</div>';
        }
    }

    async function doLogout() {
        await fetch('/api/auth/logout', {method: 'POST', credentials: 'include'});
        currentUser = null;
        currentConvId = null;
        stopChatPolling();
        destroyHomeView();
        window.location.href = '/';
    }

    // ── Conversations ──
    async function loadConversations() {
        try {
            const r = await fetch('/api/conversations', { credentials: 'include' });
            if (!r.ok) return [];
            const convs = await r.json();
            renderConvList(convs);
            return convs;
        } catch(e) {}
        return [];
    }

    function renderConvList(convs) {
        if (!elConvList) return;
        if (!convs.length) {
            elConvList.innerHTML = '<div style="color:var(--muted);padding:8px;font-size:12px;">No conversations yet</div>';
            elConvList.onclick = null;
            return;
        }
        elConvList.innerHTML = convs.map(c => {
            const active = c.id === currentConvId ? ' active' : '';
            const title = escapeHtml(c.title || 'New Chat');
            const time = c.updated_at ? timeAgo(c.updated_at) : '';
            return `
                <div class="conv-item${active}" data-id="${c.id}">
                    <div class="conv-row">
                        <div class="conv-title">${title}</div>
                        <button class="conv-delete" data-id="${c.id}" title="Delete">×</button>
                    </div>
                    <div class="conv-time">${time}</div>
                </div>`;
        }).join('');
        elConvList.onclick = (e) => {
            const deleteBtn = e.target.closest('.conv-delete');
            if (deleteBtn) {
                e.stopPropagation();
                deleteConv(deleteBtn.dataset.id);
                return;
            }
            const item = e.target.closest('.conv-item');
            if (item) {
                switchConv(item.dataset.id);
            }
        };
    }

    async function switchConv(convId, opts = {}) {
        currentConvId = convId;
        currentView = 'chat';
        destroyHomeView();
        let messages = [];
        try {
            const r = await fetch('/api/conversations/' + convId, { credentials: 'include' });
            if (r.ok) {
                const conv = await r.json();
                messages = conv.messages || [];
            }
        } catch(e) {}

        mountChat(convId);
        if (messages.length) {
            await populateHistory(messages);
        }
        if (!opts.skipListReload) loadConversations();
    }

    async function newChat() {
        currentConvId = await createConversationId();
        currentView = 'chat';
        destroyHomeView();
        setTab('chats');
        mountChat(currentConvId);
        await loadConversations();
        stopChatPolling();
        chatPollTimer = setInterval(loadConversations, 5000);
    }

    async function createConversationId() {
        try {
            const r = await fetch('/api/conversations', {method: 'POST', credentials: 'include'});
            if (r.ok) {
                const data = await r.json();
                if (data && data.id) return data.id;
            }
        } catch(e) {}
        return 'conv_' + crypto.randomUUID();
    }

    async function deleteConv(convId) {
        await fetch('/api/conversations/' + convId, {method: 'DELETE', credentials: 'include'});
        const convs = await loadConversations();
        if (currentConvId === convId) {
            if (convs.length) {
                await switchConv(convs[0].id, { skipListReload: true });
                await loadConversations();
            } else {
                await newChat();
            }
        }
    }

    // ── Mount vanna-chat ──
    function mountChat(convId) {
        const wrapper = document.getElementById('chat-wrapper');
        destroyHomeView();
        if (dashboardRoot) {
            dashboardRoot.unmount();
            dashboardRoot = null;
        }
        setTab('chats');
        if (elMain) {
            elMain.classList.remove('dashboard-mode');
        }
        wrapper.className = 'chat-wrapper';
        wrapper.innerHTML =
            '<vanna-chat id="vanna-chat"' +
            ' sse-endpoint="/api/vanna/v2/chat_sse"' +
            ' conversation-id="' + convId + '"' +
            ' theme="light"></vanna-chat>';
        const chatEl = document.getElementById('vanna-chat');
        if (chatEl) {
            chatEl.windowed = false;
            chatEl.allowMinimize = false;
            chatEl.showProgress = false;
            chatEl.title = 'RadBlick';
            chatEl.subtitle = '';
            chatEl.placeholder = 'Ask a question...';
            chatEl.starterPrompts = [
                {
                    title: 'Create a Dashboard',
                    subtitle: 'Bike events over the last 30 days',
                    icon: '📊',
                    prompt: 'Create a dashboard of bike events over the last 30 days.'
                },
                {
                    title: 'Create a Chart',
                    subtitle: 'Bike issue categories',
                    icon: '📈',
                    prompt: 'Create a chart of bike issue categories.'
                },
                {
                    title: 'Analyze Data',
                    subtitle: 'Districts with the most bike events',
                    icon: '📍',
                    prompt: 'Analyze which districts have the most bike events.'
                }
            ];
        }
    }

    async function populateHistory(messages) {
        if (!messages.length) return;
        await customElements.whenDefined('vanna-chat');
        const chatEl = document.getElementById('vanna-chat');
        if (!chatEl) return;
        setTimeout(() => {
            if (typeof chatEl.clearMessages === 'function') {
                chatEl.clearMessages();
            }
            messages.forEach(m => {
                if (m.role === 'user' || m.role === 'assistant') {
                    chatEl.addMessage(m.content, m.role);
                }
            });
            if (typeof chatEl.scrollToLastMessage === 'function') {
                chatEl.scrollToLastMessage();
            }
        }, 150);
    }

    async function loadDashboard(dashboardId) {
        currentView = 'dashboard';
        destroyHomeView();
        stopChatPolling();
        setTab('dashboards');
        if (elMain) {
            elMain.classList.add('dashboard-mode');
        }

        if (dashboardRoot) {
            dashboardRoot.unmount();
            dashboardRoot = null;
        }

        const wrapper = document.getElementById('chat-wrapper');
        wrapper.className = 'chat-wrapper';
        wrapper.innerHTML = '<div id="dashboard-root"></div>';

        if (dashboardId === 'bike-events') {
            try {
                const module = await import('/dashboards/bike-events/dist/bike-events.js');
                dashboardRoot = module.renderBikeEventsDashboard(document.getElementById('dashboard-root'));
                selectDashboardCard('bike-events');
            } catch (error) {
                console.error('Failed to load dashboard:', error);
                wrapper.innerHTML = '<div style="padding: 20px; text-align: center;"><p style="color: red;">Failed to load dashboard. Please ensure it has been built.</p></div>';
            }
        }
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function timeAgo(iso) {
        const d = new Date(iso);
        const now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff/60) + 'm ago';
        if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
        return d.toLocaleDateString();
    }

    // ── Home rendering ──
    function formatPct(pct) {
        if (pct === null || pct === undefined || Number.isNaN(pct)) return 'n/a';
        const sign = pct > 0 ? '+' : '';
        return sign + pct.toFixed(0) + '%';
    }

    function deltaClass(pct) {
        if (pct === null || pct === undefined || Number.isNaN(pct)) return 'neutral';
        const v = Number(pct);
        if (v === 0) return 'neutral';
        if (v > 0) {
            if (v >= 50) return 'pos-high';
            if (v >= 20) return 'pos-med';
            return 'pos-low';
        }
        // Negative change
        if (v <= -50) return 'neg-high';
        if (v <= -20) return 'neg-med';
        return 'neg-low';
    }

    function renderHomeHighlights(h) {
        const el = document.getElementById('home-highlights');
        if (!el) return;

        const cur = h.current || {};
        const delta = h.delta || {};
        const topCats = h.top_categories || [];
        const topDists = h.top_districts || [];
        const topServices = h.top_services || [];

        const newPct = delta.new_events_pct;
        const newPctClass = deltaClass(newPct);

        const card1 = `
            <div class="home-card metric">
                <h3>New bike-related reports (${h.window_days || 7}d)</h3>
                <div class="home-metric-value">${Number(cur.new_events || 0).toLocaleString()}</div>
                <div style="margin-top:10px;">
                    <span class="home-delta ${newPctClass}">${formatPct(newPct)} vs prev ${h.window_days || 7}d</span>
                </div>
                <div class="home-note" style="margin-top:10px;">
                    Previous = the prior rolling ${h.window_days || 7} days (days ${Number(h.window_days||7)+1}-${Number(h.window_days||7)*2} ago).
                </div>
                <div class="home-submetrics">
                    <div class="home-submetric">
                        <div class="k">Open</div>
                        <div class="v">${Number(cur.open_events||0).toLocaleString()}</div>
                    </div>
                    <div class="home-submetric">
                        <div class="k">Closed</div>
                        <div class="v">${Number(cur.closed_events||0).toLocaleString()}</div>
                    </div>
                </div>
            </div>
        `;

        const card2 = `
            <div class="home-card">
                <h3>Top issue categories (${h.window_days || 7}d)</h3>
                <div class="home-toplist">
                    ${topCats.length ? topCats.map(it => `
                        <div class="home-topitem">
                            <div class="label">${escapeHtml(it.category || 'Unknown')}</div>
                            <div class="count">${Number(it.count || 0).toLocaleString()}</div>
                        </div>
                    `).join('') : '<div class="home-loading">No category data in this window.</div>'}
                </div>
            </div>
        `;

        const card3 = `
            <div class="home-card">
                <h3>Top districts (${h.window_days || 7}d)</h3>
                <div class="home-toplist">
                    ${topDists.length ? topDists.map(it => `
                        <div class="home-topitem">
                            <div class="label">${escapeHtml(it.district || 'Unknown')}</div>
                            <div class="count">${Number(it.count || 0).toLocaleString()}</div>
                        </div>
                    `).join('') : '<div class="home-loading">No district data in this window.</div>'}
                </div>
            </div>
        `;

        const card4 = `
            <div class="home-card">
                <h3>Top services (${h.window_days || 7}d)</h3>
                <div class="home-toplist">
                    ${topServices.length ? topServices.map(it => `
                        <div class="home-topitem">
                            <div class="label">${escapeHtml(it.service_name || 'Unknown')}</div>
                            <div class="count">${Number(it.count || 0).toLocaleString()}</div>
                        </div>
                    `).join('') : '<div class="home-loading">No service data in this window.</div>'}
                </div>
            </div>
        `;

        el.innerHTML = card1 + card2 + card3 + card4;
    }

    function sagsUnsUrl(ev) {
        const seq = ev.sequence_number;
        const year = ev.year;
        if (!seq || !year) return null;
        return 'https://sags-uns.stadt-koeln.de/requests/' + String(seq) + '-' + String(year);
    }

    function normalizeStatus(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'open' || s.includes('offen')) return 'open';
        if (s === 'closed' || s.includes('geschlossen') || s.includes('erledigt')) return 'closed';
        return 'unknown';
    }

    async function openHomeEventModal(summary) {
        const host = await ensureHomeModal();
        host.style.display = 'block';
        const modal = host.shadowRoot && host.shadowRoot.getElementById('home-dashboard-modal-panel');
        if (!modal) return;

        modal.innerHTML = '<div class="text-center text-gray-600 dark:text-gray-400">Loading event...</div>';

        homeModalEscHandler = (e) => {
            if (e.key === 'Escape') closeHomeModal();
        };
        document.addEventListener('keydown', homeModalEscHandler);

        let details = null;
        try {
            if (summary && summary.service_request_id) {
                const r = await fetch('/api/dashboards/bike-events/event/' + encodeURIComponent(summary.service_request_id), { credentials: 'include' });
                if (r.ok) details = await r.json();
            }
        } catch(e) {}
        const ev = details || summary || {};

        // Copy the dashboard modal structure/classes (see Bike Events dashboard).
        const mediaUrl = ev.media_path ? ('https://sags-uns.stadt-koeln.de/system/files/' + ev.media_path) : null;
        const sourceUrl = sagsUnsUrl(ev) || sagsUnsUrl(summary);
        const status = String(ev.status || '').toLowerCase() === 'open' ? 'open' : 'closed';
        const reported = ev.requested_at ? new Date(ev.requested_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'n/a';

        modal.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="flex-1">
                    <div class="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">${escapeHtml(ev.title || 'Bike event')}</div>
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${escapeHtml(String(ev.bike_issue_emoji || '🚴').trim())}</span>
                        <span class="px-3 py-1 rounded-full text-xs font-semibold ${status === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}">${escapeHtml(String(ev.status || '').toUpperCase() || 'N/A')}</span>
                    </div>
                </div>
                <button id="home-dashboard-modal-close-x" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" type="button" aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            ${mediaUrl ? `<div class="mb-6"><img src="${mediaUrl}" alt="${escapeHtml(ev.title || '')}" class="w-full h-64 object-cover rounded-lg shadow-md" onerror="this.style.display='none'"></div>` : ''}
            <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div>
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Service ID</p>
                    <p class="text-sm text-gray-900 dark:text-gray-100">${escapeHtml(ev.service_request_id || '')}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Reported</p>
                    <p class="text-sm text-gray-900 dark:text-gray-100">${escapeHtml(reported)}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Status</p>
                    <p class="text-sm text-gray-900 dark:text-gray-100 capitalize">${escapeHtml(ev.status || '')}</p>
                </div>
                <div>
                    <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Backlog</p>
                    <p class="text-sm text-gray-900 dark:text-gray-100">${escapeHtml(ev.backlog_bucket || '')}</p>
                </div>
            </div>
            ${ev.description ? `
                <div class="mb-6">
                    <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">${escapeHtml(ev.description)}</p>
                </div>
            ` : ''}
            <div class="mb-6">
                <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Location</h3>
                <p class="text-sm text-gray-900 dark:text-gray-100 mb-2">${escapeHtml(ev.address_string || '')}</p>
                <div class="grid grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                    ${ev.district ? `<div>District: ${escapeHtml(ev.district)}</div>` : ''}
                    ${ev.zip_code ? `<div>ZIP: ${escapeHtml(ev.zip_code)}</div>` : ''}
                    ${ev.street ? `<div>Street: ${escapeHtml(ev.street)}</div>` : ''}
                </div>
                ${ev.cat_path ? `<p class="text-xs text-gray-500 dark:text-gray-500 mt-2">${escapeHtml(ev.cat_path)}</p>` : ''}
            </div>
            <div class="flex space-x-3">
                ${sourceUrl ? `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md text-center transition-colors">View on Cologne Website →</a>` : ''}
                <button id="home-dashboard-modal-close" class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors" type="button">Close</button>
            </div>
        `;

        modal.querySelector('#home-dashboard-modal-close')?.addEventListener('click', closeHomeModal);
        modal.querySelector('#home-dashboard-modal-close-x')?.addEventListener('click', closeHomeModal);
    }

    function renderHomeFeed(events) {
        const el = document.getElementById('home-feed');
        if (!el) return;
        const items = (events || []).slice(0, 20);
        if (!items.length) {
            el.innerHTML = '<div class="home-loading">No events found.</div>';
            return;
        }
        el.innerHTML = items.map((ev, idx) => {
            const title = escapeHtml(ev.title || ev.bike_issue_category || 'Bike event');
            const district = escapeHtml(ev.district || 'Unknown district');
            const cat = escapeHtml(ev.bike_issue_category || 'Unknown category');
            const statusClass = normalizeStatus(ev.status);
            const when = ev.requested_at ? new Date(ev.requested_at).toLocaleString() : 'n/a';
            return `
                <div class="home-feed-item status-${statusClass}" data-idx="${idx}">
                    <div class="home-feed-title">${title}</div>
                    <div class="home-feed-meta">
                        <div>${district} • ${cat}</div>
                        <div>${when}</div>
                    </div>
                </div>
            `;
        }).join('');

        el.onclick = (e) => {
            const item = e.target.closest('.home-feed-item');
            if (item) {
                const idx = Number(item.dataset.idx);
                openHomeEventModal(items[idx]);
            }
        };
    }

    function hashString(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0);
    }

    function categoryColor(category) {
        const palette = [
            '#2563eb', '#16a34a', '#f97316', '#ef4444', '#0ea5e9',
            '#a855f7', '#14b8a6', '#f59e0b', '#22c55e', '#e11d48'
        ];
        const key = String(category || 'unknown');
        return palette[hashString(key) % palette.length];
    }

    function statusBorder(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'open' || s.includes('offen')) return '#16a34a';
        if (s === 'closed' || s.includes('geschlossen') || s.includes('erledigt')) return '#ef4444';
        return '#64748b';
    }

    function initHomeMap(events) {
        const mapEl = document.getElementById('home-map');
        if (!mapEl || !window.L) return;
        destroyHomeMap();

        const all = (events || []).filter(e => typeof e.lat === 'number' && typeof e.lon === 'number');
        const noteEl = document.getElementById('home-map-note');
        let shown = all;
        if (all.length > 1500) {
            shown = all.slice(0, 1500);
            if (noteEl) noteEl.textContent = 'Showing 1500 of ' + all.length.toLocaleString() + ' points (newest first).';
        } else {
            if (noteEl) noteEl.textContent = all.length ? '' : 'No mappable points in this window.';
        }

        homeMap = L.map('home-map', { zoomControl: true });
        homeMap.setView([50.9375, 6.9603], 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(homeMap);

        if (L.markerClusterGroup) {
            homeCluster = L.markerClusterGroup({ chunkedLoading: true });
        } else {
            homeCluster = L.layerGroup();
        }

        shown.forEach(ev => {
            const border = statusBorder(ev.status);
            const fill = categoryColor(ev.bike_issue_category);
            const bg = 'rgba(255,255,255,0.92)';
            const emoji = String(ev.bike_issue_emoji || '🚴').trim();
            const icon = L.divIcon({
                className: '',
                html: '<div class="home-emoji-marker" style="background:' + bg + ';border:2px solid ' + border + ';box-shadow: 0 10px 22px rgba(15,23,42,0.18), 0 0 0 4px ' + fill + '20;">' + emoji + '</div>',
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            });
            const m = L.marker([ev.lat, ev.lon], { icon });
            const ttTitle = escapeHtml(ev.title || ev.bike_issue_category || 'Bike event');
            const ttDesc = ev.description ? escapeHtml(String(ev.description).slice(0, 150) + (String(ev.description).length > 150 ? '...' : '')) : '';
            const ttHtml =
                '<div class="t-head"><span style="font-size:16px;line-height:1;">' + escapeHtml(emoji) + '</span><span>' + ttTitle + '</span></div>' +
                (ttDesc ? '<div class="t-desc">' + ttDesc + '</div>' : '') +
                '<div class="t-hint">Click for full details</div>';
            m.bindTooltip(ttHtml, { direction: 'top', offset: [0, -18], opacity: 0.95, className: 'home-tooltip' });
            m.on('click', () => openHomeEventModal(ev));
            homeCluster.addLayer(m);
        });
        homeCluster.addTo(homeMap);
    }

    // ── Events ──
    document.getElementById('logout-btn').addEventListener('click', doLogout);
    document.getElementById('sidebar-new-chat').addEventListener('click', newChat);
    elTabHome.addEventListener('click', () => showHomeView());
    elTabChats.addEventListener('click', () => showChatView());
    elTabDashboards.addEventListener('click', () => loadDashboard('bike-events'));
    elDashboardList.addEventListener('click', (e) => {
        const card = e.target.closest('.dashboard-card');
        if (!card) return;
        const dashboardId = card.dataset.dashboard;
        loadDashboard(dashboardId);
        selectDashboardCard(dashboardId);
    });

    // ── Init ──
    checkAuth();
    </script>
</body>
</html>"""
        import json

        schema_json_str = json.dumps(request.app.state.schema_json)
        html_with_components = html.replace(
            "__COMPONENT_SCRIPT__", component_script_tag
        )
        # Inject schema data as a global variable
        schema_injection = f"""<script>
        window.VANNA_SCHEMA = {schema_json_str};
    </script>
    """
        return html_with_components.replace("</head>", schema_injection + "</head>")

    print("\n" + "=" * 60)
    print("RadBlick Web Server is ready!")
    print("=" * 60)
    print("\nOpen your browser and go to:")
    print("   http://localhost:8000")
    print("\nLogin with a seeded user account.")
    print("=" * 60 + "\n")

    return app


# Create the app instance.
# In test mode we skip env validation and LLM initialization so unit tests can run
# without Supabase credentials or external services.
app = create_app(test_mode=os.getenv("VANNA_TEST_MODE") == "1")


if __name__ == "__main__":
    import uvicorn

    # Get host and port from environment or use defaults
    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("SERVER_PORT", "8000"))

    # Run the server
    uvicorn.run(app, host=host, port=port)
