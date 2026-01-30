# Web Interface Quick Start Guide

## Starting the Web Server

### Option 1: Quick Start Script (Easiest)

```bash
./start_web.sh
```

### Option 2: Direct Python Command

```bash
source venv/bin/activate
python vanna_web_server.py
```

## Accessing the Web Interface

Once the server is running, open your browser and go to:

```
http://localhost:8000
```

You should see a login screen. After signing in with a seeded user, the chat interface loads.

If you have not created a user yet:

```bash
python scripts/run_migrations.py
python scripts/seed_users.py --email admin@company.com --password secret123 --name "Admin User" --role admin
```

## Features

### Web Chat Interface Includes:

- **Private Login** - No public signup; users are seeded by an admin
- **Per-User Chat History** - Conversations persist and are scoped to the logged-in user
- **Real-time Streaming** - See responses as they're generated
- **Automatic Tables** - Query results displayed in interactive tables
- **Auto Charts** - Data automatically visualized when appropriate
- **Secure** - Queries restricted to public.v_bike_events view only

### Chart Axis Labels

Charts are generated via the `visualize_data` tool. Axis labels default to a human-friendly format (e.g. `bike_issue_category` → "Bike Issue Category").

If you want to override labels explicitly, the tool supports:

- `title`: Chart title
- `labels`: Mapping from column name to display label
- `x_axis_title` / `y_axis_title`: Axis title overrides (take precedence over `labels`)

### Example Queries

The interface includes helpful examples, but here are more to try:

**Basic Queries:**

- "How many events are there?"
- "Show me 5 random events"
- "What columns are in the v_bike_events view?"

**Analytics:**

- "What are the top 10 cities by event count?"
- "Group events by category and show counts"
- "What percentage of events are bike-related?"

**Time-based:**

- "Show me events from last week"
- "How many events were created in 2024?"
- "Show monthly event trends"

**Geographic:**

- "Which districts have the most events?"
- "Show events in a specific city"
- "List all unique cities"

**Category Analysis:**

- "What are the most common subcategories?"
- "Show the distribution of service names"
- "Count events by status"

## Configuration

### Change Server Port

Edit your `.env` file:

```bash
SERVER_PORT=3000  # Change to your preferred port
```

### Change Server Host

Edit your `.env` file:

```bash
SERVER_HOST=127.0.0.1  # Localhost only
# or
SERVER_HOST=0.0.0.0    # Accept from any IP (default)
```

## Troubleshooting

### Server won't start

1. Check that port 8000 is not already in use:
   ```bash
   lsof -i :8000
   ```
2. Try a different port in `.env`

### Can't connect in browser

1. Make sure the server is running (check terminal output)
2. Try `http://127.0.0.1:8000` instead of `localhost`
3. Check firewall settings

### Chat not responding

1. Check browser console for errors (F12)
2. Verify your `.env` credentials are correct
3. Check server logs in terminal

### Slow responses

- This is normal! Claude Haiku 3 streams responses in real-time
- Complex queries may take 10-30 seconds
- Check your Anthropic API rate limits

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

## Differences from Terminal Version

| Feature   | Web Interface                     | Terminal Interface    |
| --------- | ---------------------------------- | --------------------- |
| UI        | Private web app (login required)   | Simple text prompts   |
| Streaming | Real-time in browser               | Real-time in terminal |
| Tables    | Interactive HTML tables            | Plain text tables     |
| Charts    | Automatic visualizations           | Not available         |

## Next Steps

- Share the URL with team members (if on same network)
- Deploy to a server for remote access
- Customize the UI colors in `vanna_web_server.py`

## API Endpoints

The server exposes these endpoints:

- `GET /` - Web chat interface (HTML)
- `POST /api/vanna/v2/chat_sse` - Streaming chat endpoint
- `POST /api/auth/login` - Log in (sets session cookie)
- `POST /api/auth/logout` - Log out
- `GET /api/auth/me` - Current user
- `GET /api/conversations` - List conversations for current user
- `POST /api/conversations` - Create a conversation
- `GET /api/conversations/{id}` - Conversation messages
- `DELETE /api/conversations/{id}` - Delete conversation
- `GET /docs` - FastAPI auto-generated documentation
- `GET /openapi.json` - OpenAPI schema

You can build custom frontends using the `/api/vanna/v2/chat_sse` endpoint!
