# Tests POST /fuel-log/scan-pump and POST /fuel-log/scan-odometer (Step 2,
# no Jira task yet): the normal success path, file-type/size/empty
# rejection, an unreadable photo still returning 200, a genuine Gemini
# failure surfacing as a plain 422, image validation (Pillow) rejecting an
# unsafe file before Gemini is ever called, and the "camera" feature's
# usage-limit wiring (a real limit hit is 429; the limiter itself failing
# is 503, fail-closed — unlike the Advisor).

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.services.image_validation import InvalidImage
from app.services.llm_client import CAMERA_SCAN_FAILURE_MESSAGE, LLMError
from app.services.usage_limiter import UsageCheckFailed, UsageLimitExceeded

client = TestClient(app)


@pytest.fixture(autouse=True)
def _logged_in_user():
    app.dependency_overrides[get_current_user_id] = lambda: "user-123"
    yield
    app.dependency_overrides.pop(get_current_user_id, None)


@pytest.fixture(autouse=True)
def _default_no_usage_limiting():
    """Every test in this file except the usage-limiting ones below runs
    as though the AI-usage-limit check always passes."""
    with patch("app.routers.fuel_camera.enforce_usage"):
        yield


@pytest.fixture(autouse=True)
def _default_passthrough_image_validation():
    """validate_and_sanitize_image is Pillow-backed and tested on its own
    (test_image_validation.py) — here it just needs to hand back
    something, by default, so these endpoint tests aren't coupled to
    real image bytes."""
    with patch(
        "app.routers.fuel_camera.validate_and_sanitize_image",
        return_value=(b"sanitized-bytes", "image/jpeg"),
    ):
        yield


def _fake_image_file(name="pump.jpg", content_type="image/jpeg", size=1024):
    return {"file": (name, b"x" * size, content_type)}


# --- POST /fuel-log/scan-pump -------------------------------------------


def test_scan_pump_returns_the_extracted_fields_on_success():
    with patch("app.routers.fuel_camera.extract_pump_fields") as mock_extract:
        mock_extract.return_value = {"readable": True, "liters": 19.6, "total_price": 2_940_000.0, "currency": "LBP"}
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file())

    assert response.status_code == 200
    assert response.json() == {"readable": True, "liters": 19.6, "total_price": 2_940_000.0, "currency": "LBP"}
    mock_extract.assert_called_once_with(b"sanitized-bytes", "image/jpeg")


def test_scan_pump_returns_unreadable_fields_without_erroring():
    with patch("app.routers.fuel_camera.extract_pump_fields") as mock_extract:
        mock_extract.return_value = {"readable": False, "liters": None, "total_price": None, "currency": None}
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file())

    assert response.status_code == 200
    assert response.json()["readable"] is False


def test_scan_pump_requires_a_file():
    response = client.post("/fuel-log/scan-pump")

    assert response.status_code == 422


@pytest.mark.parametrize("content_type", ["text/plain", "application/pdf", "image/heic", ""])
def test_scan_pump_rejects_a_non_allowed_content_type(content_type):
    with patch("app.routers.fuel_camera.extract_pump_fields") as mock_extract:
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file(content_type=content_type))

    assert response.status_code == 422
    mock_extract.assert_not_called()


def test_scan_pump_rejects_an_oversized_file():
    with patch("app.routers.fuel_camera.extract_pump_fields") as mock_extract:
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file(size=8 * 1024 * 1024 + 1))

    assert response.status_code == 422
    mock_extract.assert_not_called()


def test_scan_pump_rejects_an_empty_file():
    with patch("app.routers.fuel_camera.extract_pump_fields") as mock_extract:
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file(size=0))

    assert response.status_code == 422
    mock_extract.assert_not_called()


def test_scan_pump_rejects_an_unsafe_image_before_calling_gemini():
    with patch(
        "app.routers.fuel_camera.validate_and_sanitize_image",
        side_effect=InvalidImage("That doesn't look like a readable photo. Please try again."),
    ), patch("app.routers.fuel_camera.extract_pump_fields") as mock_extract:
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file())

    assert response.status_code == 422
    assert response.json()["detail"] == "That doesn't look like a readable photo. Please try again."
    mock_extract.assert_not_called()


def test_scan_pump_surfaces_a_gemini_failure_as_a_plain_422():
    with patch("app.routers.fuel_camera.extract_pump_fields", side_effect=LLMError(CAMERA_SCAN_FAILURE_MESSAGE)):
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file())

    assert response.status_code == 422
    assert response.json()["detail"] == CAMERA_SCAN_FAILURE_MESSAGE


# --- POST /fuel-log/scan-odometer ---------------------------------------


def test_scan_odometer_returns_the_extracted_reading_on_success():
    with patch("app.routers.fuel_camera.extract_odometer_fields") as mock_extract:
        mock_extract.return_value = {"readable": True, "odometer_km": 84610}
        response = client.post("/fuel-log/scan-odometer", files=_fake_image_file("odo.jpg"))

    assert response.status_code == 200
    assert response.json() == {"readable": True, "odometer_km": 84610}


def test_scan_odometer_returns_unreadable_without_erroring():
    with patch("app.routers.fuel_camera.extract_odometer_fields") as mock_extract:
        mock_extract.return_value = {"readable": False, "odometer_km": None}
        response = client.post("/fuel-log/scan-odometer", files=_fake_image_file("odo.jpg"))

    assert response.status_code == 200
    assert response.json()["readable"] is False


def test_scan_odometer_surfaces_a_gemini_failure_as_a_plain_422():
    with patch("app.routers.fuel_camera.extract_odometer_fields", side_effect=LLMError(CAMERA_SCAN_FAILURE_MESSAGE)):
        response = client.post("/fuel-log/scan-odometer", files=_fake_image_file("odo.jpg"))

    assert response.status_code == 422
    assert response.json()["detail"] == CAMERA_SCAN_FAILURE_MESSAGE


# --- "camera" usage-limit wiring (shared by both endpoints) -------------


@pytest.mark.parametrize("path", ["/fuel-log/scan-pump", "/fuel-log/scan-odometer"])
def test_a_genuine_limit_hit_is_a_429_and_never_calls_gemini(path):
    with patch(
        "app.routers.fuel_camera.enforce_usage",
        side_effect=UsageLimitExceeded("You've reached today's limit of 20 for this feature. It resets at midnight Beirut time."),
    ), patch("app.routers.fuel_camera.extract_pump_fields") as mock_pump, patch(
        "app.routers.fuel_camera.extract_odometer_fields"
    ) as mock_odo:
        response = client.post(path, files=_fake_image_file())

    assert response.status_code == 429
    assert "resets at midnight Beirut time" in response.json()["detail"]
    mock_pump.assert_not_called()
    mock_odo.assert_not_called()


@pytest.mark.parametrize("path", ["/fuel-log/scan-pump", "/fuel-log/scan-odometer"])
def test_FAILS_CLOSED_when_the_usage_check_itself_fails(path):
    # Unlike the Advisor, a broken usage counter must not let an unmetered
    # Gemini call through.
    with patch(
        "app.routers.fuel_camera.enforce_usage", side_effect=UsageCheckFailed("network blip")
    ), patch("app.routers.fuel_camera.extract_pump_fields") as mock_pump, patch(
        "app.routers.fuel_camera.extract_odometer_fields"
    ) as mock_odo:
        response = client.post(path, files=_fake_image_file())

    assert response.status_code == 503
    assert response.json()["detail"] == CAMERA_SCAN_FAILURE_MESSAGE
    mock_pump.assert_not_called()
    mock_odo.assert_not_called()


def test_usage_is_enforced_before_the_image_is_validated_or_gemini_is_called():
    # The usage check runs before the (possibly expensive) image decode —
    # confirmed by the 429 arriving even though validation/extraction
    # are left as normal mocks that would otherwise succeed.
    with patch(
        "app.routers.fuel_camera.enforce_usage", side_effect=UsageLimitExceeded("capped")
    ), patch("app.routers.fuel_camera.validate_and_sanitize_image") as mock_validate:
        response = client.post("/fuel-log/scan-pump", files=_fake_image_file())

    assert response.status_code == 429
    mock_validate.assert_not_called()
