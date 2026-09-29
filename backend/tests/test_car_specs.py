# Tests GET /cars/spec-suggestions: the normal case (passes make/model/
# year through to the lookup and returns its result), a missing required
# query param, and that a lookup finding nothing still returns 200 with
# all-null fields rather than an error (never blocks onboarding).

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _logged_in_user():
    """CAR-24: every route now requires a logged-in caller, so these tests run
    as one (the real token check is covered by test_auth.py and
    test_auth_required.py)."""
    app.dependency_overrides[get_current_user_id] = lambda: "user-123"
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


def test_returns_suggestions_for_a_valid_request():
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        mock_lookup.return_value = {
            "vehicle_confirmed": True,
            "engine_type": None,
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
        "engine_type": None,
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


# --- CAR-23: query parameter validation -----------------------------------
# make / model / year end up in outbound API URLs, so they are bounded and
# non-blank, and the year must be sane. Rejected values never reach the lookup.

import pytest  # noqa: E402


@pytest.mark.parametrize(
    "params",
    [
        {"make": "   ", "model": "Civic", "year": 2020},
        {"make": "Honda", "model": "   ", "year": 2020},
        {"make": "H" * 61, "model": "Civic", "year": 2020},
        {"make": "Honda", "model": "C" * 61, "year": 2020},
        {"make": "Honda", "model": "Civic", "year": 1899},
        {"make": "Honda", "model": "Civic", "year": 2101},
        {"make": "Honda", "model": "Civic", "year": -5},
        {"make": "Honda", "model": "Civic", "year": 99999999},
        {"make": "Honda", "model": "Civic", "year": "abc"},
    ],
)
def test_invalid_query_params_are_a_422_and_never_reach_the_lookup(params):
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        response = client.get("/cars/spec-suggestions", params=params)

    assert response.status_code == 422
    mock_lookup.assert_not_called()


@pytest.mark.parametrize("year", [1900, 2016, 2100])
def test_boundary_years_and_a_60_character_make_are_accepted(year):
    with patch("app.routers.car_specs.get_spec_suggestions") as mock_lookup:
        mock_lookup.return_value = {
            "vehicle_confirmed": False, "engine_type": None, "fuel_efficiency": None,
            "cylinders": None, "drivetrain": None, "transmission": None,
        }
        response = client.get(
            "/cars/spec-suggestions", params={"make": "H" * 60, "model": "Civic", "year": year}
        )

    assert response.status_code == 200


# --- CAR-57: POST /cars/scan-registration -----------------------------------

from app.services.llm_client import LLMError  # noqa: E402


def _fake_image_file(content_type="image/jpeg", size=1024):
    return {"file": ("registration.jpg", b"x" * size, content_type)}


def test_scan_registration_returns_the_extracted_fields_on_success():
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        mock_extract.return_value = {
            "readable": True,
            "make": "Toyota",
            "model": "Corolla",
            "year": 2019,
            "vin": "1HGCM82633A004352",
            "license_plate": "BML 78901",
        }
        response = client.post("/cars/scan-registration", files=_fake_image_file())

    assert response.status_code == 200
    assert response.json() == {
        "readable": True,
        "make": "Toyota",
        "model": "Corolla",
        "year": 2019,
        "vin": "1HGCM82633A004352",
        "license_plate": "BML 78901",
    }
    mock_extract.assert_called_once()
    assert mock_extract.call_args.args[0] == b"x" * 1024
    assert mock_extract.call_args.args[1] == "image/jpeg"


def test_scan_registration_returns_unreadable_fields_without_erroring():
    # A genuine registration photo Gemini just couldn't confidently read —
    # distinct from a request-level failure, still a 200.
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        mock_extract.return_value = {
            "readable": False, "make": None, "model": None, "year": None, "vin": None, "license_plate": None,
        }
        response = client.post("/cars/scan-registration", files=_fake_image_file())

    assert response.status_code == 200
    assert response.json()["readable"] is False


def test_scan_registration_requires_a_file():
    response = client.post("/cars/scan-registration")

    assert response.status_code == 422


@pytest.mark.parametrize(
    "content_type",
    ["text/plain", "application/pdf", "application/octet-stream", "video/mp4", ""],
)
def test_scan_registration_rejects_a_non_image_content_type(content_type):
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        response = client.post(
            "/cars/scan-registration", files=_fake_image_file(content_type=content_type)
        )

    assert response.status_code == 422
    mock_extract.assert_not_called()


def test_scan_registration_rejects_an_oversized_file():
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        response = client.post(
            "/cars/scan-registration",
            files=_fake_image_file(size=8 * 1024 * 1024 + 1),
        )

    assert response.status_code == 422
    mock_extract.assert_not_called()


def test_scan_registration_accepts_a_file_right_at_the_8mb_boundary():
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        mock_extract.return_value = {
            "readable": True, "make": "Toyota", "model": "Corolla", "year": 2019, "vin": None, "license_plate": None,
        }
        response = client.post(
            "/cars/scan-registration",
            files=_fake_image_file(size=8 * 1024 * 1024),
        )

    assert response.status_code == 200


def test_scan_registration_rejects_an_empty_file():
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        response = client.post("/cars/scan-registration", files=_fake_image_file(size=0))

    assert response.status_code == 422
    mock_extract.assert_not_called()


def test_scan_registration_surfaces_a_gemini_failure_as_a_plain_422():
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        mock_extract.side_effect = LLMError("Could not read that image right now. Please try again or enter details manually.")
        response = client.post("/cars/scan-registration", files=_fake_image_file())

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Could not read that image right now. Please try again or enter details manually."
    )


@pytest.mark.parametrize("content_type", ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
def test_scan_registration_accepts_every_allowed_image_type(content_type):
    with patch("app.routers.car_specs.extract_registration_fields") as mock_extract:
        mock_extract.return_value = {
            "readable": True, "make": None, "model": None, "year": None, "vin": None, "license_plate": None,
        }
        response = client.post(
            "/cars/scan-registration", files=_fake_image_file(content_type=content_type)
        )

    assert response.status_code == 200
