# Tests the /health endpoint: normal case (DB reachable), and the edge
# case where the DB call fails — the endpoint should still respond 200
# with a generic "unreachable" status, never leak the raw error detail.

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_ok_and_connected_when_db_is_reachable():
    with patch("app.routers.health.supabase") as mock_supabase:
        mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock()

        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "connected"}


def test_health_reports_unreachable_without_leaking_error_detail():
    with patch("app.routers.health.supabase") as mock_supabase:
        mock_supabase.table.side_effect = Exception(
            "connection refused: password authentication failed for user X"
        )

        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body == {"status": "ok", "database": "unreachable"}
    assert "password" not in response.text
