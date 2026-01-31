"""
Vanna AI Web Server with Chat Interface

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


def create_app():
    """Create and configure the FastAPI application."""

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
    from fastapi import FastAPI, Request
    from fastapi.responses import HTMLResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles

    app = FastAPI(
        title="Vanna AI Events Explorer",
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
    <title>Vanna AI - Sign In</title>
    <style>
        :root {
            --bg: rgb(248, 250, 252);
            --panel: #ffffff;
            --border: oklch(0.929 0.013 255.508);
            --text: oklch(0.145 0 0);
            --muted: oklch(0.446 0.043 257.281);
            --accent: oklch(0.208 0.042 265.755);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Geist", "Geist Fallback", "Segoe UI", system-ui, -apple-system, sans-serif;
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
            width: 420px;
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
        }
        .login-card h2 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 6px;
        }
        .login-card p {
            font-size: 14px;
            color: var(--muted);
            margin-bottom: 16px;
        }
        .login-card input {
            width: 100%;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid var(--border);
            margin-bottom: 10px;
            font-size: 14px;
        }
        .login-card .error {
            color: #e11d48;
            font-size: 13px;
            margin-bottom: 10px;
            display: none;
        }
        .btn {
            padding: 8px 16px;
            border-radius: 10px;
            font-size: 14px;
            font-weight: 500;
            border: 1px solid transparent;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
        }
        .btn.primary {
            background: var(--accent);
            color: #fff;
        }
    </style>
</head>
<body>
    <div class="login-screen">
        <div class="login-card">
            <h2>Welcome to Vanna</h2>
            <p>Please log in to continue</p>
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
    <title>Vanna AI - Events Explorer</title>
    __COMPONENT_SCRIPT__
    <style>
        :root {
            /* Match Vanna colors */
            --navy: rgb(2, 61, 96);
            --cream: rgb(231, 225, 207);
            --teal: rgb(21, 168, 168);
            --orange: rgb(254, 93, 38);
            
            /* Layout colors */
            --bg: rgb(249, 250, 251);
            --panel: rgb(255, 255, 255);
            --rail-bg: rgb(252, 252, 253);
            --border: rgb(229, 231, 235);
            --text: rgb(15, 23, 42);
            --muted: rgb(100, 116, 139);
            --accent: var(--teal);
            
            /* Shadows matching Vanna */
            --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.04);
            --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.08);
            --shadow-md: 0 4px 8px -2px rgba(0, 0, 0, 0.08);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: "Geist", "Geist Fallback", "Segoe UI", system-ui, -apple-system, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
        }

        .app {
            min-height: 100vh;
            position: relative;
        }

        /* ── Logged In Layout ── */
        .shell {
            display: none;
            height: 100vh;
            pointer-events: none;
        }
        .shell.active {
            display: flex;
            flex-direction: row;
            pointer-events: auto;
        }
        .rail {
            width: 64px;
            background: var(--panel);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 16px 0;
            gap: 8px;
        }
        .rail-spacer {
            flex: 1;
        }
        .rail-btn {
            width: 40px;
            height: 40px;
            border-radius: 10px;
            border: none;
            background: transparent;
            color: var(--muted);
            display: grid;
            place-items: center;
            cursor: pointer;
            transition: all 150ms ease;
        }
        .rail-btn:hover {
            background: rgb(241, 245, 249);
            color: var(--teal);
            transform: scale(1.05);
        }
        .rail-btn.active {
            background: rgba(21, 168, 168, 0.1);
            color: var(--teal);
            box-shadow: inset 0 0 0 1px var(--teal);
        }
        .avatar-btn {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--navy), var(--teal));
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            border: 2px solid rgba(255, 255, 255, 0.3);
            box-shadow: var(--shadow-md);
            transition: all 150ms ease;
        }
        .avatar-btn:hover {
            transform: scale(1.1);
            box-shadow: var(--shadow-md);
        }

        .sidebar {
            width: 280px;
            background: rgb(252, 252, 253);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            padding: 12px;
            gap: 6px;
        }
        .sidebar.collapsed {
            width: 0;
            padding: 0;
            border: none;
            overflow: hidden;
        }
        .sidebar-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 6px;
        }
        .sidebar-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .new-chat-text {
            font-size: 12px;
            color: var(--accent);
            background: transparent;
            border: none;
            cursor: pointer;
        }
        .sidebar-close-btn {
            width: 20px;
            height: 20px;
            border: none;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            transition: all 150ms ease;
        }
        .sidebar-close-btn:hover {
            background: rgba(0, 0, 0, 0.05);
            color: var(--text);
        }
        .conv-list {
            overflow-y: auto;
            padding: 4px 2px 12px 2px;
        }
        .conv-item {
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid transparent;
            cursor: pointer;
            margin-bottom: 4px;
            transition: all 150ms ease;
        }
        .conv-item:hover {
            background: rgb(244, 246, 248);
            border-color: var(--border);
        }
        .conv-item.active {
            background: rgba(21, 168, 168, 0.08);
            border-color: var(--teal);
            box-shadow: var(--shadow-xs);
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
            margin-top: 4px;
        }
        .conv-delete {
            float: right;
            border: none;
            background: transparent;
            color: var(--muted);
            cursor: pointer;
        }

        .dashboard-list {
            padding: 8px;
            overflow-y: auto;
        }
        .dashboard-card {
            padding: 12px;
            border-radius: 8px;
            border: 1px solid var(--border);
            cursor: pointer;
            margin-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: all 150ms ease;
        }
        .dashboard-card:hover {
            border-color: var(--teal);
            background: rgb(252, 252, 253);
            box-shadow: var(--shadow-sm);
            transform: translateX(2px);
        }
        .dashboard-card.active {
            background: rgba(21, 168, 168, 0.08);
            border-color: var(--teal);
            box-shadow: var(--shadow-sm);
        }
        .dashboard-icon {
            font-size: 24px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--rail-bg);
            border-radius: 8px;
            flex-shrink: 0;
        }
        .dashboard-info {
            flex: 1;
            min-width: 0;
            overflow: hidden;
        }
        .dashboard-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .dashboard-desc {
            font-size: 11px;
            color: var(--muted);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .main {
            flex: 1;
            background: var(--panel);
            display: flex;
            flex-direction: column;
        }
        #chat-wrapper {
            flex: 1;
            display: flex;
        }
        .empty-chat {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--muted);
            font-size: 15px;
        }
        vanna-chat {
            width: 100%;
            height: 100%;
            min-height: 500px;
        }

        /* ── User Menu ── */
        .user-menu {
            position: absolute;
            left: 72px;
            bottom: 16px;
            width: 224px;
            border: 1px solid oklch(0.922 0 0);
            border-radius: 8px;
            background: var(--panel);
            padding: 4px;
            display: none;
            z-index: 20;
        }
        .user-menu.open {
            display: block;
        }
        .user-menu button {
            width: 100%;
            height: 32px;
            border: none;
            background: transparent;
            text-align: left;
            padding: 0 10px;
            font-size: 13px;
            color: var(--text);
            cursor: pointer;
        }
        .user-menu button:hover {
            background: oklch(0.97 0 0);
        }
    </style>
</head>
<body>
    <div class="app">
        <!-- Logged In App Shell -->
        <div id="logged-in" class="shell">
            <div class="rail">
                <button class="rail-btn" id="rail-collapse" title="Close sidebar" style="display: none;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                    </svg>
                </button>
                <button class="rail-btn active" id="rail-new" title="New chat">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11 5h2v14h-2zM5 11h14v2H5z"/>
                    </svg>
                </button>
                <button class="rail-btn" id="rail-history" title="Chats">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"/>
                    </svg>
                </button>
                <button class="rail-btn" title="Sources">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4 4h16v4H4zm0 6h16v10H4z"/>
                    </svg>
                </button>
                <button class="rail-btn" id="rail-dashboards" title="Dashboards">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 3h8v8H3zm0 10h8v8H3zm10-10h8v8h-8zm0 10h8v8h-8z"/>
                    </svg>
                </button>
                <div class="rail-spacer"></div>
                <button class="rail-btn avatar-btn" id="user-avatar-btn" title="User menu">U</button>
            </div>

            <div id="chat-sidebar" class="sidebar">
                <div class="sidebar-header">
                    <div class="sidebar-title">Chats</div>
                    <button class="sidebar-close-btn" id="chat-close-btn" title="Close sidebar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="conv-list" id="conv-list"></div>
            </div>

            <div id="dashboard-sidebar" class="sidebar collapsed">
                <div class="sidebar-header">
                    <div class="sidebar-title">Dashboards</div>
                    <button class="sidebar-close-btn" id="dashboard-close-btn" title="Close sidebar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="dashboard-list" id="dashboard-list">
                    <div class="dashboard-card" data-dashboard="bike-events">
                        <div class="dashboard-icon">🚴</div>
                        <div class="dashboard-info">
                            <div class="dashboard-name">Bike Events</div>
                            <div class="dashboard-desc">Cologne infrastructure issues</div>
                        </div>
                    </div>
                </div>
            </div>

            <main class="main">
                <div id="chat-wrapper"></div>
            </main>
        </div>

        <!-- User Menu -->
        <div id="user-menu" class="user-menu">
            <button type="button">Help &amp; Support</button>
            <button type="button">Roadmap</button>
            <button type="button">Upgrade Plan</button>
            <button type="button" id="logout-btn">Log out</button>
        </div>

    </div>

    <script>
    if (window.location.hostname === '0.0.0.0') {
        window.location.replace(window.location.href.replace('0.0.0.0', 'localhost'));
    }
    let currentUser = null;
    let currentConvId = null;
    let chatPollTimer = null;
    let sidebarCollapsed = false;
    let currentDashboard = null;
    let currentView = 'chat';
    let dashboardRoot = null;

    const elLoggedIn = document.getElementById('logged-in');
    const elUserMenu = document.getElementById('user-menu');
    const elDashboardSidebar = document.getElementById('dashboard-sidebar');
    const elChatSidebar = document.getElementById('chat-sidebar');
    const elRailCollapse = document.getElementById('rail-collapse');

    function setLoggedIn() {
        elLoggedIn.classList.add('active');
        updateUserAvatar();
    }

    function toggleUserMenu() {
        elUserMenu.classList.toggle('open');
    }

    function updateUserAvatar() {
        const btn = document.getElementById('user-avatar-btn');
        const name = currentUser?.display_name || currentUser?.email || 'U';
        const initial = name.trim().charAt(0).toUpperCase();
        btn.textContent = initial || 'U';
    }

    // ── Auth ──
    async function checkAuth() {
        try {
            const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
            if (r.ok) {
                currentUser = await r.json();
                await showChatView();
            } else {
                window.location.href = '/';
            }
        } catch(e) {
            window.location.href = '/';
        }
    }

    async function showChatView() {
        setLoggedIn();
        const convs = await loadConversations();
        if (convs.length) {
            await switchConv(convs[0].id, { skipListReload: true });
            await loadConversations();
        } else {
            currentConvId = null;
            showEmptyChat();
        }
        if (chatPollTimer) clearInterval(chatPollTimer);
        chatPollTimer = setInterval(loadConversations, 5000);
    }


    async function doLogout() {
        await fetch('/api/auth/logout', {method: 'POST', credentials: 'include'});
        currentUser = null;
        currentConvId = null;
        if (chatPollTimer) clearInterval(chatPollTimer);
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
        const el = document.getElementById('conv-list');
        if (!convs.length) {
            el.innerHTML = '<div style="color:var(--muted);padding:8px;font-size:12px;">No conversations yet</div>';
            el.onclick = null;
            return;
        }
        el.innerHTML = convs.map(c => {
            const active = c.id === currentConvId ? ' active' : '';
            const title = escapeHtml(c.title || 'New Chat');
            const time = c.updated_at ? timeAgo(c.updated_at) : '';
            return `
                <div class="conv-item${active}" data-id="${c.id}">
                    <button class="conv-delete" data-id="${c.id}">×</button>
                    <div class="conv-title">${title}</div>
                    <div class="conv-time">${time}</div>
                </div>`;
        }).join('');
        el.onclick = (e) => {
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

    async function deleteConv(convId) {
        await fetch('/api/conversations/' + convId, {method: 'DELETE', credentials: 'include'});
        const convs = await loadConversations();
        if (currentConvId === convId) {
            if (convs.length) {
                await switchConv(convs[0].id, { skipListReload: true });
                await loadConversations();
            } else {
                currentConvId = null;
                showEmptyChat();
            }
        }
    }

    async function newChat() {
        currentConvId = await createConversationId();
        mountChat(currentConvId);
        loadConversations();
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

    function showEmptyChat() {
        const wrapper = document.getElementById('chat-wrapper');
        wrapper.innerHTML = '<div class="empty-chat">Select a chat or start a new one</div>';
    }

    // ── Mount vanna-chat ──
    function mountChat(convId) {
        const wrapper = document.getElementById('chat-wrapper');
        wrapper.innerHTML =
            '<vanna-chat id="vanna-chat"' +
            ' sse-endpoint="/api/vanna/v2/chat_sse"' +
            ' conversation-id="' + convId + '"' +
            ' theme="light"></vanna-chat>';
        const chatEl = document.getElementById('vanna-chat');
        if (chatEl) {
            chatEl.allowMinimize = false;
            chatEl.showProgress = false;
            chatEl.title = 'Vanna';
            chatEl.subtitle = '';
            chatEl.placeholder = 'Ask a question...';
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

    function toggleSidebar(type = 'chats') {
        // Update rail button states
        document.querySelectorAll('.rail-btn').forEach(btn => btn.classList.remove('active'));

        if (type === 'dashboards') {
            document.getElementById('rail-dashboards').classList.add('active');
            elDashboardSidebar.classList.remove('collapsed');
            elChatSidebar.classList.add('collapsed');
            elRailCollapse.style.display = 'grid';
            currentView = 'dashboard';
        } else if (type === 'chats') {
            document.getElementById('rail-history').classList.add('active');
            elChatSidebar.classList.remove('collapsed');
            elDashboardSidebar.classList.add('collapsed');
            elRailCollapse.style.display = 'grid';
            currentView = 'chat';
        } else if (type === 'new') {
            document.getElementById('rail-new').classList.add('active');
            elChatSidebar.classList.add('collapsed');
            elDashboardSidebar.classList.add('collapsed');
            elRailCollapse.style.display = 'none';
            currentView = 'chat';
        } else if (type === 'none') {
            // Close sidebar but keep current view
            elChatSidebar.classList.add('collapsed');
            elDashboardSidebar.classList.add('collapsed');
            elRailCollapse.style.display = 'none';
            // Keep the rail button active for the current view
            if (currentView === 'dashboard') {
                document.getElementById('rail-dashboards').classList.add('active');
            }
        }
    }

    async function loadDashboard(dashboardId) {
        currentView = 'dashboard';
        currentDashboard = dashboardId;

        // Unmount previous dashboard if exists
        if (dashboardRoot) {
            dashboardRoot.unmount();
            dashboardRoot = null;
        }

        const wrapper = document.getElementById('chat-wrapper');
        wrapper.innerHTML = '<div id="dashboard-root"></div>';

        if (dashboardId === 'bike-events') {
            try {
                const module = await import('/dashboards/bike-events/dist/bike-events.js');
                dashboardRoot = module.renderBikeEventsDashboard(document.getElementById('dashboard-root'));
            } catch (error) {
                console.error('Failed to load dashboard:', error);
                wrapper.innerHTML = '<div style="padding: 20px; text-align: center;"><p style="color: red;">Failed to load dashboard. Please ensure it has been built.</p></div>';
            }
        }
    }

    // ── Helpers ──
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

    // ── Events ──
    document.getElementById('logout-btn').addEventListener('click', doLogout);
    document.getElementById('user-avatar-btn').addEventListener('click', toggleUserMenu);
    document.getElementById('rail-new').addEventListener('click', newChat);
    document.getElementById('rail-history').addEventListener('click', () => toggleSidebar('chats'));
    document.getElementById('rail-dashboards').addEventListener('click', () => toggleSidebar('dashboards'));
    document.getElementById('rail-collapse').addEventListener('click', () => toggleSidebar('none'));
    document.getElementById('chat-close-btn').addEventListener('click', () => toggleSidebar('none'));
    document.getElementById('dashboard-close-btn').addEventListener('click', () => toggleSidebar('none'));

    // Dashboard card click handler
    document.getElementById('dashboard-list').addEventListener('click', (e) => {
        const card = e.target.closest('.dashboard-card');
        if (!card) return;

        const dashboardId = card.dataset.dashboard;
        loadDashboard(dashboardId);

        // Update active state
        document.querySelectorAll('.dashboard-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
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
    print("Vanna AI Web Server is ready!")
    print("=" * 60)
    print("\nOpen your browser and go to:")
    print("   http://localhost:8000")
    print("\nLogin with a seeded user account.")
    print("=" * 60 + "\n")

    return app


# Create the app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    # Get host and port from environment or use defaults
    host = os.getenv("SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("SERVER_PORT", "8000"))

    # Run the server
    uvicorn.run(app, host=host, port=port)
