import os
import unittest
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import patch


class FakeCursor:
    def __init__(self):
        self.description = None
        self._one = None
        self._rows = []

    def execute(self, query, params=None):
        q = " ".join((query or "").split()).lower()

        # Highlights: counts query
        if "from public.v_bike_events" in q and "count(*) filter" in q:
            self._one = (10, 6, 4, 8, 5, 3)
            self.description = None
            self._rows = []
            return

        # Highlights: top categories
        if "group by bike_issue_category" in q:
            self._one = None
            self.description = [("category",), ("count",)]
            self._rows = [
                ("Lane obstruction", 4),
                ("Pothole", 3),
                ("Bike lane markings", 2),
            ]
            return

        # Highlights: top districts
        if "group by district" in q:
            self._one = None
            self.description = [("district",), ("count",)]
            self._rows = [
                ("Innenstadt", 5),
                ("Ehrenfeld", 3),
            ]
            return

        # Data health: pipeline runs
        if "group by 1" in q and "service_name" in q:
            self._one = None
            self.description = [("service_name",), ("count",)]
            self._rows = [
                ("Road", 6),
                ("Bike lanes", 4),
            ]
            return

        # Recent events endpoint
        if "select service_request_id" in q and "from public.v_bike_events" in q:
            self.description = [
                ("service_request_id",),
                ("requested_at",),
                ("status",),
                ("district",),
                ("title",),
                ("bike_issue_category",),
                ("lat",),
                ("lon",),
                ("year",),
                ("sequence_number",),
            ]
            self._one = None
            self._rows = [
                (
                    "sr_1",
                    datetime(2026, 2, 6, 12, 0, tzinfo=timezone.utc),
                    "open",
                    "Innenstadt",
                    "Broken bike lane",
                    "Lane obstruction",
                    50.94,
                    6.96,
                    2026,
                    1234,
                ),
                (
                    "sr_2",
                    datetime(2026, 2, 6, 11, 0, tzinfo=timezone.utc),
                    "closed",
                    "Ehrenfeld",
                    "Pothole near crossing",
                    "Pothole",
                    50.95,
                    6.95,
                    2026,
                    1233,
                ),
            ]
            return

        self._one = None
        self._rows = []
        self.description = None

    def fetchone(self):
        return self._one

    def fetchall(self):
        return list(self._rows)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeConnection:
    def cursor(self):
        return FakeCursor()


@contextmanager
def fake_get_connection():
    yield FakeConnection()


class TestHomeApi(unittest.TestCase):
    def setUp(self):
        os.environ["VANNA_TEST_MODE"] = "1"

        from fastapi.testclient import TestClient

        import vanna_web_server

        self.vanna_web_server = vanna_web_server
        self.client = TestClient(vanna_web_server.create_app(test_mode=True))

    def test_unauthenticated_home_highlights_returns_401(self):
        r = self.client.get("/api/home/highlights")
        self.assertEqual(r.status_code, 401)

    def test_unauthenticated_home_recent_returns_401(self):
        r = self.client.get("/api/home/recent")
        self.assertEqual(r.status_code, 401)

    def test_authenticated_home_endpoints_smoke(self):
        with patch.object(
            self.vanna_web_server, "verify_jwt", return_value={"sub": "u1", "email": "e1"}
        ), patch("db.get_connection", fake_get_connection):
            r1 = self.client.get("/api/home/highlights", cookies={"session": "token"})
            self.assertEqual(r1.status_code, 200)
            data1 = r1.json()
            self.assertIn("window_days", data1)
            self.assertIn("current", data1)
            self.assertIn("previous", data1)
            self.assertIn("delta", data1)
            self.assertIn("top_categories", data1)
            self.assertIn("top_districts", data1)
            self.assertIn("top_services", data1)

            r2 = self.client.get(
                "/api/home/recent?window_days=7&limit=10", cookies={"session": "token"}
            )
            self.assertEqual(r2.status_code, 200)
            data2 = r2.json()
            self.assertIn("data", data2)
            self.assertEqual(data2["count"], 2)
            self.assertIsInstance(data2["data"][0].get("requested_at"), str)


if __name__ == "__main__":
    unittest.main()
