# Authentication guard for the whole API (CAR-24): every route except /health
# must refuse a caller who has no valid Supabase session — checked against
# EVERY operation the API publishes (its OpenAPI inventory), so a newly added
# endpoint that forgets
# authentication makes this test fail instead of shipping public. (Before
# CAR-24, /trip-planner/directions, /trip-planner/fuel-prices and
# /cars/spec-suggestions answered anyone on the internet, spending our Google
# Maps / NHTSA / API Ninjas / LLM quotas.)
#
# No network: a request without credentials is rejected by the dependency
# before any handler runs, and get_user is mocked for the token cases. (A
# mutation check — removing the router-level dependency — makes 7 of these
# fail, so the guard genuinely has teeth.)

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

# The only routes allowed to answer without credentials. Adding to this set is
# a deliberate security decision, not an accident.
PUBLIC_ROUTES = {("GET", "/health")}

client = TestClient(app)

_HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def _api_routes():
    """(METHOD, path) for every operation the API publishes. Read from the
    OpenAPI schema — the API's own inventory of what it exposes — so it stays
    correct however FastAPI wires its routers internally."""
    paths = app.openapi()["paths"]
    return sorted(
        (method.upper(), path)
        for path, operations in paths.items()
        for method in operations
        if method in _HTTP_METHODS
    )


def _concrete(path):
    """Fills any {path_param} so the route can actually be requested."""
    out, depth = [], 0
    for char in path:
        if char == "{":
            depth += 1
            out.append("x")
        elif char == "}":
            depth -= 1
        elif depth == 0:
            out.append(char)
    return "".join(out)


PROTECTED = [route for route in _api_routes() if route not in PUBLIC_ROUTES]


def test_the_route_inventory_finds_the_apis_routes():
    found = set(_api_routes())
    for expected in [
        ("GET", "/health"),
        ("POST", "/ai-advisor/classify"),
        ("POST", "/trip-planner/estimate"),
        ("POST", "/trip-planner/directions"),
        ("GET", "/trip-planner/fuel-prices"),
        ("GET", "/cars/spec-suggestions"),
    ]:
        assert expected in found
    assert len(PROTECTED) >= 5


@pytest.mark.parametrize("method, path", PROTECTED, ids=[f"{m} {p}" for m, p in PROTECTED])
@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": ""},
        {"Authorization": "Bearer"},
        {"Authorization": "Basic dXNlcjpwYXNz"},
        {"Authorization": "Bearer not.a.jwt"},
    ],
    ids=["no-header", "empty", "bearer-no-token", "basic-scheme", "garbage-token"],
)
def test_every_protected_route_answers_401_without_a_valid_session(method, path, headers):
    with patch("app.auth.supabase") as mock_supabase:
        mock_supabase.auth.get_user.side_effect = Exception("invalid jwt")

        # An empty JSON body on purpose: authentication must be decided BEFORE
        # request validation, so an unauthenticated caller learns nothing about
        # the expected fields (a 422 here would be an information leak).
        response = client.request(method, _concrete(path), headers=headers, json={})

    assert response.status_code == 401
    assert response.json()["detail"] in (
        "Missing or invalid Authorization header.",
        "Invalid or expired session.",
    )


def test_anything_that_is_not_401_without_credentials_is_exactly_the_public_allow_list():
    public = set()
    with patch("app.auth.supabase") as mock_supabase, patch("app.routers.health.supabase"):
        mock_supabase.auth.get_user.side_effect = Exception("invalid jwt")
        for method, path in _api_routes():
            response = client.request(method, _concrete(path), json={})
            if response.status_code != 401:
                public.add((method, path))

    assert public == PUBLIC_ROUTES


def test_a_valid_session_gets_past_authentication_on_a_protected_route():
    user_response = MagicMock()
    user_response.user.id = "user-123"

    with patch("app.auth.supabase") as mock_supabase, patch(
        "app.routers.trip_planner.get_route_summary",
        return_value={"distance_km": 1.0, "duration_min": 1, "duration_in_traffic_min": 1},
    ):
        mock_supabase.auth.get_user.return_value = user_response
        response = client.post(
            "/trip-planner/directions",
            headers={"Authorization": "Bearer a-valid-token"},
            json={"origin": "Beirut", "destination": "Tripoli"},
        )

    assert response.status_code == 200
    mock_supabase.auth.get_user.assert_called_once_with("a-valid-token")


def test_an_unauthenticated_call_never_reaches_the_paid_services():
    with patch("app.routers.trip_planner.get_route_summary") as maps, patch(
        "app.routers.car_specs.get_spec_suggestions"
    ) as specs, patch("app.routers.trip_planner.get_current_fuel_prices") as prices, patch(
        "app.routers.ai_advisor.classify_issue"
    ) as llm:
        client.post("/trip-planner/directions", json={"origin": "A", "destination": "B"})
        client.get("/cars/spec-suggestions", params={"make": "Honda", "model": "Civic", "year": 2020})
        client.get("/trip-planner/fuel-prices")
        client.post("/ai-advisor/classify", json={"car_id": "x", "description": "brakes"})

    maps.assert_not_called()
    specs.assert_not_called()
    prices.assert_not_called()
    llm.assert_not_called()
