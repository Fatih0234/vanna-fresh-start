import unittest

from restricted_sql_runner import RestrictedPostgresRunner


class TestRestrictedPostgresRunnerSqlValidation(unittest.TestCase):
    def setUp(self) -> None:
        self.runner = RestrictedPostgresRunner(
            allowed_tables=["public.v_bike_events"],
            connection_string="postgresql://user:pass@localhost:5432/db",
        )

    def test_allows_query_with_extract_from_column(self) -> None:
        sql = """
        WITH events AS (
          SELECT
            service_request_id,
            requested_at,
            lat,
            lon,
            district,
            bike_issue_category,
            FLOOR(lat / 0.00075) AS lat_bin,
            FLOOR(lon / 0.00075) AS lon_bin,
            FLOOR(EXTRACT(EPOCH FROM requested_at) / (2 * 3600)) AS time_bin
          FROM public.v_bike_events
          WHERE requested_at >= NOW() - INTERVAL '90 days'
        )
        SELECT *
        FROM events;
        """

        is_valid, error_message = self.runner._validate_sql(sql)
        self.assertTrue(is_valid, error_message)

    def test_denies_non_allowlisted_table(self) -> None:
        sql = "SELECT * FROM public.users;"
        is_valid, error_message = self.runner._validate_sql(sql)
        self.assertFalse(is_valid)
        self.assertIn("public.users", error_message)

    def test_allows_generate_series_in_from_clause(self) -> None:
        sql = """
        WITH week_grid AS (
          SELECT (date_trunc('week', now()) - (i * interval '1 week')) AS week_start
          FROM generate_series(0, 3) AS t(i)
        )
        SELECT *
        FROM public.v_bike_events
        CROSS JOIN week_grid;
        """

        is_valid, error_message = self.runner._validate_sql(sql)
        self.assertTrue(is_valid, error_message)


if __name__ == "__main__":
    unittest.main()
