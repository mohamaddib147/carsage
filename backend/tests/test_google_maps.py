# Tests the Google Maps Directions integration: normal case (incl. the
# route polyline used by the CAR-48 map), invalid/unresolvable addresses,
# and network failure — the outbound httpx call is mocked so these never
# hit the real API.

from unittest.mock import MagicMock

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


def _payload(distance_m, duration_s, traffic_s=None, polyline="_p~iF~ps|U_ulLnnqC"):
    leg = {
        "distance": {"text": "x", "value": distance_m},
        "duration": {"text": "x", "value": duration_s},
    }
    if traffic_s is not None:
        leg["duration_in_traffic"] = {"text": "x", "value": traffic_s}
    route = {"legs": [leg]}
    if polyline is not None:
        route["overview_polyline"] = {"points": polyline}
    return {"status": "OK", "routes": [route]}


def _stub(monkeypatch, payload):
    monkeypatch.setattr(
        "app.services.google_maps.httpx.get",
        lambda *args, **kwargs: _mock_response(payload),
    )


def test_returns_distance_durations_and_polyline_for_a_valid_route(monkeypatch):
    _stub(monkeypatch, _payload(12300, 1200, 1500))

    result = get_route_summary("Beirut", "Tripoli")

    assert result == {
        "distance_km": 12.3,
        "duration_min": 20,
        "duration_in_traffic_min": 25,
        "route_polyline": "_p~iF~ps|U_ulLnnqC",
    }


def test_calls_the_directions_endpoint_with_origin_destination_and_traffic(monkeypatch):
    captured = {}

    def fake_get(url, **kwargs):
        captured["url"] = url
        captured["params"] = kwargs["params"]
        return _mock_response(_payload(1000, 60, 60))

    monkeypatch.setattr("app.services.google_maps.httpx.get", fake_get)

    get_route_summary("Beirut", "Tripoli")

    assert captured["url"].endswith("/maps/api/directions/json")
    assert captured["params"]["origin"] == "Beirut"
    assert captured["params"]["destination"] == "Tripoli"
    assert captured["params"]["departure_time"] == "now"


def test_falls_back_to_baseline_duration_when_traffic_duration_is_absent(monkeypatch):
    _stub(monkeypatch, _payload(5000, 600))

    result = get_route_summary("A", "B")

    assert result["duration_min"] == result["duration_in_traffic_min"] == 10


def test_polyline_is_none_when_google_does_not_return_one(monkeypatch):
    _stub(monkeypatch, _payload(5000, 600, 600, polyline=None))

    result = get_route_summary("A", "B")

    assert result["route_polyline"] is None
    assert result["distance_km"] == 5.0


def test_raises_clear_error_for_an_unresolvable_address(monkeypatch):
    _stub(monkeypatch, {"status": "NOT_FOUND"})

    with pytest.raises(GoogleMapsError, match="Could not find a route"):
        get_route_summary("Nowhere Land", "Also Nowhere")


def test_raises_clear_error_when_there_is_no_drivable_route(monkeypatch):
    # Two valid, geocodable addresses with no route between them (e.g.
    # separated by a body of water) come back as ZERO_RESULTS.
    _stub(monkeypatch, {"status": "ZERO_RESULTS", "routes": []})

    with pytest.raises(GoogleMapsError, match="Could not find a route"):
        get_route_summary("Beirut, Lebanon", "Nicosia, Cyprus")


def test_handles_a_very_short_same_city_trip(monkeypatch):
    _stub(monkeypatch, _payload(800, 180, 240))

    result = get_route_summary("Hamra Street, Beirut", "AUB Main Gate, Beirut")

    assert result["distance_km"] == 0.8
    assert result["duration_min"] == 3
    assert result["duration_in_traffic_min"] == 4


def test_handles_a_very_long_cross_country_trip(monkeypatch):
    _stub(monkeypatch, _payload(215000, 10800, 13500))

    result = get_route_summary("Naqoura, Lebanon", "Arida, Lebanon")

    assert result["distance_km"] == 215.0
    assert result["duration_min"] == 180
    assert result["duration_in_traffic_min"] == 225


def test_raises_clear_error_when_top_level_status_is_not_ok(monkeypatch):
    _stub(monkeypatch, {"status": "REQUEST_DENIED"})

    with pytest.raises(GoogleMapsError, match="Could not calculate a route"):
        get_route_summary("A", "B")


def test_raises_clear_error_when_an_ok_response_has_no_routes(monkeypatch):
    _stub(monkeypatch, {"status": "OK", "routes": []})

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


def test_an_invalid_url_error_becomes_a_clean_maps_error_not_a_crash(monkeypatch):
    # CAR-23: an origin/destination that httpx refuses to put in a URL used to
    # escape as an unhandled InvalidURL (HTTP 500).
    def raise_invalid_url(*args, **kwargs):
        raise httpx.InvalidURL("URL component 'query' too long")

    monkeypatch.setattr("app.services.google_maps.httpx.get", raise_invalid_url)

    with pytest.raises(GoogleMapsError) as excinfo:
        get_route_summary("A" * 100, "B")

    assert "too long" not in str(excinfo.value)
