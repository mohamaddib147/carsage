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


# --- CAR-23: validation errors never echo the rejected input ----------------


def test_a_422_says_where_and_why_but_never_echoes_the_rejected_value():
    from unittest.mock import patch

    from app.auth import get_current_user_id
    from app.main import app as fastapi_app

    fastapi_app.dependency_overrides[get_current_user_id] = lambda: "user-123"
    try:
        secret_marker = "ECHO-ME-" + "Z" * 5000
        with patch("app.routers.trip_planner.get_route_summary") as mock_route:
            response = TestClient(fastapi_app).post(
                "/trip-planner/directions",
                json={"origin": "Beirut", "destination": secret_marker},
            )
    finally:
        fastapi_app.dependency_overrides.pop(get_current_user_id, None)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "destination"]
    assert "300" in body["detail"][0]["msg"]
    assert "ECHO-ME" not in response.text
    assert "input" not in body["detail"][0]
    assert len(response.text) < 500
    mock_route.assert_not_called()
