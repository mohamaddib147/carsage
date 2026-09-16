# Tests the POST /trip-planner/directions endpoint: normal case, missing
# required destination (schema validation), missing origin (business
# rule), and a Google Maps failure surfacing as a clear 400, not a stack
# trace.

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.google_maps import GoogleMapsError

client = TestClient(app)


def test_returns_distance_and_durations_for_a_valid_request():
    with patch("app.routers.trip_planner.get_route_summary") as mock_get_route:
        mock_get_route.return_value = {
            "distance_km": 12.3,
            "duration_min": 20,
            "duration_in_traffic_min": 25,
        }

        response = client.post(
            "/trip-planner/directions",
            json={"origin": "Beirut", "destination": "Tripoli"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "distance_km": 12.3,
        "duration_min": 20,
        "duration_in_traffic_min": 25,
    }
    mock_get_route.assert_called_once_with("Beirut", "Tripoli")


def test_rejects_a_missing_destination_with_a_validation_error():
    response = client.post("/trip-planner/directions", json={"origin": "Beirut"})

    assert response.status_code == 422


def test_rejects_an_empty_destination_with_a_validation_error():
    response = client.post(
        "/trip-planner/directions",
        json={"origin": "Beirut", "destination": ""},
    )

    assert response.status_code == 422


def test_returns_a_clear_error_when_origin_is_missing():
    response = client.post(
        "/trip-planner/directions", json={"destination": "Tripoli"}
    )

    assert response.status_code == 400
    assert "origin" in response.json()["detail"].lower()


def test_returns_a_clear_error_when_the_maps_lookup_fails():
    with patch("app.routers.trip_planner.get_route_summary") as mock_get_route:
        mock_get_route.side_effect = GoogleMapsError(
            "Could not find a route between that origin and destination."
        )

        response = client.post(
            "/trip-planner/directions",
            json={"origin": "???", "destination": "!!!"},
        )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Could not find a route between that origin and destination."
    }
