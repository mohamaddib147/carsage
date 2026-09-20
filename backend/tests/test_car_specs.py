# Tests GET /cars/spec-suggestions: the normal case (passes make/model/
# year through to the lookup and returns its result), a missing required
# query param, and that a lookup finding nothing still returns 200 with
# all-null fields rather than an error (never blocks onboarding).

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_returns_suggestions_for_a_valid_request():
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        mock_lookup.return_value = {
            "vehicle_confirmed": True,
            "engine_type": "Passenger Car",
            "fuel_efficiency": 14.5,
            "cylinders": 4,
            "drivetrain": "fwd",
            "transmission": "a",
        }

        response = client.get(
            "/cars/spec-suggestions",
            params={"make": "Honda", "model": "Civic", "year": 2020},
        )

    assert response.status_code == 200
    assert response.json() == {
        "vehicle_confirmed": True,
        "engine_type": "Passenger Car",
        "fuel_efficiency": 14.5,
        "cylinders": 4,
        "drivetrain": "fwd",
        "transmission": "a",
        # Not in the lookup result -> defaults to null in the response.
        "fuel_tank_capacity_liters": None,
        "fuel_tank_capacity_source": None,
    }
    mock_lookup.assert_called_once_with("Honda", "Civic", 2020)


def test_missing_required_query_param_returns_422():
    response = client.get("/cars/spec-suggestions", params={"make": "Honda", "year": 2020})

    assert response.status_code == 422


def test_returns_200_with_all_null_fields_when_nothing_is_found():
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        mock_lookup.return_value = {
            "vehicle_confirmed": False,
            "engine_type": None,
            "fuel_efficiency": None,
            "cylinders": None,
            "drivetrain": None,
            "transmission": None,
        }

        response = client.get(
            "/cars/spec-suggestions",
            params={"make": "Honda", "model": "SomeCarNotSoldInUS", "year": 2020},
        )

    assert response.status_code == 200
    assert response.json()["vehicle_confirmed"] is False


def test_passes_a_tank_capacity_through_when_the_lookup_has_one():
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        mock_lookup.return_value = {
            "vehicle_confirmed": True,
            "engine_type": None,
            "fuel_efficiency": None,
            "cylinders": 4,
            "drivetrain": "fwd",
            "transmission": "a",
            "fuel_tank_capacity_liters": 50.0,
        }

        response = client.get(
            "/cars/spec-suggestions",
            params={"make": "Honda", "model": "Civic", "year": 2020},
        )

    assert response.json()["fuel_tank_capacity_liters"] == 50.0


def test_reports_where_the_tank_capacity_came_from():
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        mock_lookup.return_value = {
            "vehicle_confirmed": True,
            "engine_type": None,
            "fuel_efficiency": None,
            "cylinders": 4,
            "drivetrain": "fwd",
            "transmission": "a",
            "fuel_tank_capacity_liters": 64.3,
            "fuel_tank_capacity_source": "ai_estimate",
        }

        response = client.get(
            "/cars/spec-suggestions",
            params={"make": "Toyota", "model": "Camry", "year": 2016},
        )

    body = response.json()
    assert body["fuel_tank_capacity_liters"] == 64.3
    assert body["fuel_tank_capacity_source"] == "ai_estimate"
