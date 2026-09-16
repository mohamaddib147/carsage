# Tests the Google Maps Distance Matrix integration: normal case,
# invalid/unresolvable addresses, and network failure — the outbound
# httpx call is mocked so these never hit the real API.

from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.google_maps import GoogleMapsError, get_route_summary


def _mock_response(json_body, status_code=200):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    response.raise_for_status.side_effect = (
        None
        if status_code < 400
        else httpx.HTTPStatusError("error", request=MagicMock(), response=response)
    )
    return response


OK_PAYLOAD = {
    "status": "OK",
    "rows": [
        {
            "elements": [
                {
                    "status": "OK",
                    "distance": {"text": "12.3 km", "value": 12300},
                    "duration": {"text": "20 mins", "value": 1200},
                    "duration_in_traffic": {"text": "25 mins", "value": 1500},
                }
            ]
        }
    ],
}


def test_returns_distance_and_durations_for_a_valid_route(monkeypatch):
    monkeypatch.setattr(
        "app.services.google_maps.httpx.get",
        lambda *args, **kwargs: _mock_response(OK_PAYLOAD),
    )

    result = get_route_summary("Beirut", "Tripoli")

    assert result == {
        "distance_km": 12.3,
        "duration_min": 20,
        "duration_in_traffic_min": 25,
    }


def test_falls_back_to_baseline_duration_when_traffic_duration_is_absent(monkeypatch):
    payload = {
        "status": "OK",
        "rows": [
            {
                "elements": [
                    {
                        "status": "OK",
                        "distance": {"text": "5 km", "value": 5000},
                        "duration": {"text": "10 mins", "value": 600},
                    }
                ]
            }
        ],
    }
    monkeypatch.setattr(
        "app.services.google_maps.httpx.get",
        lambda *args, **kwargs: _mock_response(payload),
    )

    result = get_route_summary("A", "B")

    assert result["duration_min"] == result["duration_in_traffic_min"] == 10


def test_raises_clear_error_for_an_unresolvable_address(monkeypatch):
    payload = {
        "status": "OK",
        "rows": [{"elements": [{"status": "NOT_FOUND"}]}],
    }
    monkeypatch.setattr(
        "app.services.google_maps.httpx.get",
        lambda *args, **kwargs: _mock_response(payload),
    )

    with pytest.raises(GoogleMapsError, match="Could not find a route"):
        get_route_summary("Nowhere Land", "Also Nowhere")


def test_raises_clear_error_when_top_level_status_is_not_ok(monkeypatch):
    payload = {"status": "REQUEST_DENIED"}
    monkeypatch.setattr(
        "app.services.google_maps.httpx.get",
        lambda *args, **kwargs: _mock_response(payload),
    )

    with pytest.raises(GoogleMapsError, match="Could not calculate a route"):
        get_route_summary("A", "B")


def test_raises_clear_error_on_network_failure_without_leaking_detail(monkeypatch):
    def raise_network_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused to internal-host:1234")

    monkeypatch.setattr("app.services.google_maps.httpx.get", raise_network_error)

    with pytest.raises(GoogleMapsError) as excinfo:
        get_route_summary("A", "B")

    assert "internal-host" not in str(excinfo.value)
    assert "try again" in str(excinfo.value).lower()
