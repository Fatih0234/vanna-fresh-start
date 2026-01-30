# Vanna AI - Events Explorer (Private Demo)

This setup allows you to use Vanna AI to query your Supabase PostgreSQL database using natural language, powered by Anthropic's Claude Haiku 3 model.
It includes **private, app-owned authentication (no public signup)** and **per-user chat history** stored in Supabase Postgres.

**Security Note:** This setup is configured to **only access the `public.v_bike_events` view** in your database. This restriction protects your other tables and schemas from accidental or unauthorized access.

## What is Vanna AI?

Vanna AI is a framework that converts natural language questions into SQL queries, executes them, and provides intelligent responses. It supports various LLMs and databases.

## Prerequisites

- Python 3.9 or higher
- A Supabase account with a PostgreSQL database
- An Anthropic API key

## Setup Instructions

### 1. Environment Setup

The repository has already been cloned and dependencies installed. You just need to:

1. **Activate the virtual environment:**

   ```bash
   source venv/bin/activate
   ```

2. **Configure your credentials:**
   Edit the `.env` file in the root directory and fill in your credentials:

   ```bash
   # Required: Get from https://console.anthropic.com/
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ANTHROPIC_MODEL=claude-3-haiku-20240307

   # Required: Get from Supabase Project Settings -> Database
   SUPABASE_HOST=your_project.supabase.co
   SUPABASE_PORT=5432
   SUPABASE_DATABASE=postgres
   SUPABASE_USER=postgres
   SUPABASE_PASSWORD=your_supabase_password

   # Recommended for persistent sessions
   JWT_SECRET=your_random_secret_here
   ```

### 2. Run Migrations + Seed Users (Required for Web Login)

The web UI uses private app-owned auth. You must create the tables and seed at least one user.

```bash
# Apply DB migrations (creates app_users + chat tables)
python scripts/run_migrations.py

# Seed an initial user (no public signup)
python scripts/seed_users.py --email admin@company.com --password secret123 --name "Admin User" --role admin
```

### 3. Get Your Credentials

#### Anthropic API Key

1. Go to [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to API Keys
4. Create a new API key
5. Copy it to the `ANTHROPIC_API_KEY` field in `.env`

#### Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to **Settings** → **Database**
4. Find the **Connection String** section
5. Copy the connection details:
   - **Host**: e.g., `db.xxxxxxxxxxxxx.supabase.co`
   - **Database**: Usually `postgres`
   - **User**: Usually `postgres`
   - **Password**: Your database password
   - **Port**: Usually `5432`

### 4. Run the Application

You have two options:

#### Option A: Web Interface (Recommended)

Start the web server with the private web UI:

```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Run the web server
python vanna_web_server.py
```

Then open your browser to **http://localhost:8000**

If you are not logged in, the home page shows the login screen only.
Log in using a seeded account (see Step 2) to access chat.

Features:

- Private login (no public signup)
- Per-user conversation history
- Real-time streaming responses
- Automatic table and chart rendering

#### Option B: Terminal Interface

Run the interactive command-line version:

```bash
# Make sure virtual environment is activated
source venv/bin/activate

# Run the terminal script
python vanna_supabase_setup.py
```

### 5. Usage

The application will start an interactive chat interface where you can ask questions about your database in natural language:

**Example Questions for the v_bike_events view:**

- "How many events are in the database?"
- "Show me the latest 10 events"
- "What types of events are there?"
- "Show me events from yesterday"
- "What is the average of [some column] for events?"
- "Group events by [some column] and count them"

**Note:** This is a private demo app. There is no public signup; users must be seeded by an admin.

**Important:** All queries are restricted to the `public.v_bike_events` view only. Attempts to query other tables will be blocked for security.

**Commands:**

- Type `exit` or `quit` to stop the application
- Press `Ctrl+C` to interrupt

## Project Structure

```
.
├── vanna/                      # Vanna AI source code (cloned from GitHub)
├── venv/                       # Python virtual environment
├── .env                        # Your configuration file (DO NOT COMMIT)
├── .env.example               # Template for .env file
├── auth/                       # App-owned auth (JWT + password hashing)
├── chat_persistence/           # Conversation storage + API routes
├── db/                         # Postgres connection pool
├── migrations/                 # SQL migrations for auth + chat tables
├── scripts/                    # Migration runner + user seeding
├── restricted_sql_runner.py   # Custom SQL runner (restricts to public.v_bike_events view)
├── vanna_supabase_setup.py    # Terminal/CLI application script
├── vanna_web_server.py        # Web server with chat UI (NEW!)
├── test_connection.py         # Connection test script
├── start.sh                   # Quick start helper script
└── README.md                  # This file
```

## Troubleshooting

### Import Errors

If you get import errors, make sure:

1. The virtual environment is activated: `source venv/bin/activate`
2. Dependencies are installed: `pip install -e "vanna/[anthropic,postgres,fastapi]" python-dotenv pyjwt bcrypt`

### Connection Errors

If you can't connect to Supabase:

1. Verify your credentials in the `.env` file
2. Make sure your IP is allowed in Supabase settings
3. Check that SSL is enabled (Supabase requires SSL connections)

### API Errors

If you get Anthropic API errors:

1. Verify your API key is correct
2. Check you have credits in your Anthropic account
3. Ensure the model name is correct: `claude-3-haiku-20240307`

## Models Available

You can change the Anthropic model in the `.env` file:

- `claude-3-haiku-20240307` (Fast and cost-effective - Default)
- `claude-3-5-sonnet-20241022` (More capable, higher cost)
- `claude-3-opus-20240229` (Most capable, highest cost)

## Advanced Usage

### Table Access Restriction

By default, this setup restricts Vanna AI to only query the `public.v_bike_events` view. This is configured in `restricted_sql_runner.py`.

**To allow access to different tables:**

Edit `vanna_supabase_setup.py` and change the `allowed_tables` parameter:

```python
postgres_runner = RestrictedPostgresRunner(
    allowed_tables=["public.v_bike_events", "public.users", "public.orders"],  # Add more tables
    host=supabase_host,
    # ... other parameters
)
```

**To remove all restrictions:**

Replace `RestrictedPostgresRunner` with the standard `PostgresRunner`:

```python
from vanna.integrations.postgres import PostgresRunner

postgres_runner = PostgresRunner(
    host=supabase_host,
    # ... other parameters
)
```

**Why restrict table access?**

- Security: Prevents accidental queries to sensitive tables
- Simplicity: Focuses the AI on specific data
- Performance: Reduces confusion when you have many tables
- Compliance: Helps meet data access requirements

### Using with FastAPI Server

To set up a web server with the Vanna chat component:

```python
from fastapi import FastAPI
from vanna.servers.fastapi.routes import register_chat_routes
from vanna.servers.base import ChatHandler

app = FastAPI()
chat_handler = ChatHandler(agent)
register_chat_routes(app, chat_handler)

# Run with: uvicorn your_script:app --reload
```

### Custom SQL Tools

You can extend Vanna with custom tools. See the [Vanna documentation](https://vanna.ai/docs) for more details.

## Security Notes

- **Never commit the `.env` file** - it contains sensitive credentials
- The `.env.example` file is safe to commit as it contains only placeholders
- Use environment-specific `.env` files for different deployments

## Resources

- [Vanna AI Documentation](https://vanna.ai/docs)
- [Vanna AI GitHub](https://github.com/vanna-ai/vanna)
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Supabase Documentation](https://supabase.com/docs)

## License

This setup uses:

- Vanna AI (MIT License)
- Your own Anthropic and Supabase accounts (subject to their respective terms)
