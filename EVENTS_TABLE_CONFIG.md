# Events Table Configuration

This document explains how the table restriction works and how to customize it.

## Current Setup

The Vanna AI setup is configured to **only allow queries to the `public.v_bike_events` view** in your Supabase database.

## How It Works

### 1. RestrictedPostgresRunner

The `restricted_sql_runner.py` file contains a custom PostgreSQL runner that:

- Validates all SQL queries before execution
- Extracts table references from FROM and JOIN clauses
- Blocks queries that reference non-allowed tables
- Returns clear error messages when access is denied

### 2. Query Validation

When you ask a question, the system:

1. Converts your natural language to SQL (using Claude Haiku 3)
2. Validates the SQL against allowed tables
3. Executes the query if valid
4. Returns an error if invalid

### 3. Example Restrictions

**Allowed:**

```sql
SELECT * FROM public.v_bike_events;
SELECT COUNT(*) FROM v_bike_events;  -- assumes public schema
SELECT * FROM v_bike_events WHERE created_at > NOW() - INTERVAL '1 day';
```

**Blocked:**

```sql
SELECT * FROM public.users;  -- users table not allowed
SELECT * FROM information_schema.tables;  -- system tables blocked
SELECT e.*, u.name FROM events e JOIN users u ON e.user_id = u.id;  -- users table blocked
```

## Customization

### Allow Multiple Tables

Edit `vanna_supabase_setup.py`, line ~100:

```python
postgres_runner = RestrictedPostgresRunner(
    allowed_tables=[
        "public.v_bike_events",
        "public.event_types",
        "public.event_metadata"
    ],
    host=supabase_host,
    # ...
)
```

### Different Schema

If your view is in a different schema:

```python
allowed_tables=["myschema.events"]
```

### Remove All Restrictions

If you want to allow access to all tables (not recommended):

```python
# In vanna_supabase_setup.py
from vanna.integrations.postgres import PostgresRunner  # Standard runner

postgres_runner = PostgresRunner(  # No restrictions
    host=supabase_host,
    port=supabase_port,
    database=supabase_database,
    user=supabase_user,
    password=supabase_password,
    sslmode="require",
)
```

## Security Benefits

1. **Data Protection**: Other tables remain inaccessible
2. **Focused Queries**: AI only generates queries for known tables
3. **Error Prevention**: Can't accidentally query wrong tables
4. **Compliance**: Helps meet data access policies
5. **Audit Trail**: Easy to track what data is being accessed

## Testing Table Access

To verify the restriction is working:

1. Run the application: `python vanna_supabase_setup.py`
2. Try to query a different table:
   ```
   You: Show me all users from the users table
   ```
3. You should get an error message like:
   ```
   Access denied: Table 'public.users' is not in the allowed list.
   Only these tables are accessible: public.v_bike_events
   ```

## Checking Your Events Table Schema

The setup script automatically fetches and displays your v_bike_events view schema on startup. This helps Claude understand what columns are available for querying.

If you want to see the schema manually:

```sql
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'events'
ORDER BY ordinal_position;
```

## Common Questions

**Q: Can I allow access to views?**  
A: Yes, treat views like tables: `allowed_tables=["public.v_bike_events"]`

**Q: What about temporary tables?**  
A: Temporary tables are not recommended with this setup.

**Q: Can I use table aliases?**  
A: Yes, aliases work fine: `SELECT * FROM events AS e WHERE e.id = 1`

**Q: What if my table doesn't have a schema prefix?**  
A: The runner assumes `public` schema by default if none is specified.
