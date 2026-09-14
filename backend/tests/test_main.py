# Tests CORS configuration: requests from the allowed frontend origin get
# the Access-Control-Allow-Origin header; requests from an unlisted origin
# don't (the browser enforces the actual block client-side).

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_cors_allows_the_configured_frontend_origin():
    with patch("app.routers.health.supabase") as mock_supabase:
        mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock()
        response = client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_does_not_allow_an_unlisted_origin():
    with patch("app.routers.health.supabase") as mock_supabase:
        mock_supabase.table.return_value.select.return_value.limit.return_value.execute.return_value = MagicMock()
        response = client.get("/health", headers={"Origin": "http://evil.example.com"})

    assert "access-control-allow-origin" not in response.headers
