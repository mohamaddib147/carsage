# Tests the Trip Planner endpoints: POST /directions (normal case,
# missing required destination, missing origin, a Google Maps failure),
# GET /fuel-prices, and POST /estimate — the full route+cost+save flow,
# including authorization (a car that isn't the caller's own, and a
# missing/invalid session), and CAR-42's traffic-adjusted cost estimate
# (_traffic_adjusted_efficiency directly, plus its wiring into the
# estimate response's new estimated_cost_current_traffic_* fields —
# the original estimated_cost_lbp/usd and trips.estimated_cost stay the
# light-traffic figure, unchanged from before CAR-42).

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.routers.trip_planner import _traffic_adjusted_efficiency
from app.services.fuel_prices import FuelPriceError
from app.services.google_maps import GoogleMapsError

client = TestClient(app)


def test_returns_distance_and_durations_for_a_valid_request():
    with patch("app.routers.trip_planner.get_route_summary") as mock_get_route:
        mock_get_route.return_value = {
            "distance_km": 12.3,
            "duration_min": 20,
            "duration_in_traffic_min": 25,
            "route_polyline": "abc123",
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
        "route_polyline": "abc123",
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


def test_traffic_adjusted_efficiency_is_unchanged_with_no_traffic_slowdown():
    assert _traffic_adjusted_efficiency(10.0, 60, 60) == 10.0


def test_traffic_adjusted_efficiency_scales_linearly_below_the_cap():
    # 50% slower than the no-traffic baseline -> half of the max 30%
    # penalty (the cap is reached at a full 2x slowdown) -> 15% worse.
    result = _traffic_adjusted_efficiency(10.0, 60, 90)
    assert result == pytest.approx(10.0 / 1.15)


def test_traffic_adjusted_efficiency_caps_at_the_maximum_penalty():
    # A 2x slowdown hits the cap exactly...
    at_cap = _traffic_adjusted_efficiency(10.0, 60, 120)
    assert at_cap == pytest.approx(10.0 / 1.30)
    # ...and anything worse than that is capped at the same penalty, not
    # scaled further.
    way_over = _traffic_adjusted_efficiency(10.0, 60, 300)
    assert way_over == at_cap


def test_traffic_adjusted_efficiency_guards_against_a_zero_duration():
    assert _traffic_adjusted_efficiency(10.0, 0, 0) == 10.0


def test_returns_current_fuel_prices_in_lbp_and_usd():
    with patch("app.routers.trip_planner.get_current_fuel_prices") as mock_get_prices:
        mock_get_prices.return_value = {
            "95_octane": 89000.0,
            "98_octane": 88850.0,
            "diesel": 73300.0,
        }

        response = client.get("/trip-planner/fuel-prices")

    assert response.status_code == 200
    body = response.json()
    assert body["lbp_per_usd"] == 89000
    assert body["prices"]["95_octane"] == {
        "lbp_per_liter": 89000.0,
        "usd_per_liter": 1.0,
    }


def test_returns_a_clear_error_when_fuel_prices_are_unavailable():
    with patch("app.routers.trip_planner.get_current_fuel_prices") as mock_get_prices:
        mock_get_prices.side_effect = FuelPriceError(
            "Could not reach the fuel price source."
        )

        response = client.get("/trip-planner/fuel-prices")

    assert response.status_code == 503
    assert response.json() == {"detail": "Could not reach the fuel price source."}


def _mock_supabase_for_estimate(car_data, trip_id="trip-1"):
    """Mocks supabase.table("cars")...maybe_single() to return `car_data`,
    and supabase.table("trips").insert(...) to echo back the inserted row
    plus an id. Returns (mock_supabase, captured_insert_dict).

    Matches supabase-py's real (surprising) behavior: maybe_single().execute()
    returns None outright — not a response object with .data = None — when
    nothing matches, which is why car_data=None here mocks execute() itself
    returning None.
    """
    mock_supabase = MagicMock()

    cars_table = MagicMock()
    cars_table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        MagicMock(data=car_data) if car_data is not None else None
    )

    trips_table = MagicMock()
    captured = {}

    def insert(row):
        captured["row"] = row
        insert_result = MagicMock()
        insert_result.execute.return_value = MagicMock(data=[{"id": trip_id, **row}])
        return insert_result

    trips_table.insert.side_effect = insert

    mock_supabase.table.side_effect = lambda name: {
        "cars": cars_table,
        "trips": trips_table,
    }[name]

    return mock_supabase, captured


class TestPostEstimate:
    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def test_estimates_cost_using_the_default_fuel_price_and_saves_the_trip(self):
        mock_supabase, captured = _mock_supabase_for_estimate(
            {"fuel_efficiency": 10, "fuel_type": "Gasoline"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary"
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices"
        ) as mock_prices:
            mock_route.return_value = {
                "distance_km": 100.0,
                "duration_min": 60,
                "duration_in_traffic_min": 75,
            }
            mock_prices.return_value = {"95_octane": 90000.0}

            response = client.post(
                "/trip-planner/estimate",
                json={
                    "car_id": "00000000-0000-4000-8000-000000000001",
                    "origin": "Beirut",
                    "destination": "Tripoli",
                },
            )

        assert response.status_code == 200
        body = response.json()
        # 100 km / 10 km/L = 10 L; 10 L * 90000 LBP/L = 900000 LBP.
        assert body["estimated_cost_lbp"] == 900000.0
        assert body["estimated_cost_usd"] == round(900000 / 89000, 2)
        assert body["fuel_price_used_lbp"] == 90000.0
        # duration_in_traffic_min=75 vs duration_min=60 -> 1.25x -> a 7.5%
        # traffic penalty (half of the cap, since the cap is a 2x slowdown).
        assert body["estimated_cost_current_traffic_lbp"] == 967500.0
        assert body["estimated_cost_current_traffic_usd"] == round(967500 / 89000, 2)
        assert captured["row"]["user_id"] == "user-123"
        assert captured["row"]["car_id"] == "00000000-0000-4000-8000-000000000001"
        # trips.estimated_cost stays the light-traffic figure, unchanged.
        assert captured["row"]["estimated_cost"] == 900000.0

    @pytest.mark.parametrize(
        "route_extra, expected",
        [({"route_polyline": "_p~iF~ps|U_ulLnnqC"}, "_p~iF~ps|U_ulLnnqC"), ({}, None)],
    )
    def test_estimate_returns_the_route_polyline_but_does_not_persist_it(
        self, route_extra, expected
    ):
        mock_supabase, captured = _mock_supabase_for_estimate(
            {"fuel_efficiency": 10, "fuel_type": "Gasoline"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary"
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices"
        ) as mock_prices:
            mock_route.return_value = {
                "distance_km": 100.0,
                "duration_min": 60,
                "duration_in_traffic_min": 60,
                **route_extra,
            }
            mock_prices.return_value = {"95_octane": 90000.0}

            response = client.post(
                "/trip-planner/estimate",
                json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "Beirut", "destination": "Tripoli"},
            )

        assert response.status_code == 200
        assert response.json()["route_polyline"] == expected
        assert "route_polyline" not in captured["row"]

    def test_estimate_response_uses_the_light_traffic_figure_with_no_traffic_slowdown(
        self,
    ):
        mock_supabase, _ = _mock_supabase_for_estimate(
            {"fuel_efficiency": 10, "fuel_type": "Gasoline"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary"
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices"
        ) as mock_prices:
            mock_route.return_value = {
                "distance_km": 100.0,
                "duration_min": 60,
                "duration_in_traffic_min": 60,
            }
            mock_prices.return_value = {"95_octane": 90000.0}

            response = client.post(
                "/trip-planner/estimate",
                json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "Beirut", "destination": "Tripoli"},
            )

        body = response.json()
        assert body["estimated_cost_current_traffic_lbp"] == body["estimated_cost_lbp"]

    def test_uses_a_user_provided_fuel_price_override_instead_of_the_default(self):
        mock_supabase, captured = _mock_supabase_for_estimate(
            {"fuel_efficiency": 10, "fuel_type": "Gasoline"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary"
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices"
        ) as mock_prices:
            mock_route.return_value = {
                "distance_km": 100.0,
                "duration_min": 60,
                "duration_in_traffic_min": 75,
            }

            response = client.post(
                "/trip-planner/estimate",
                json={
                    "car_id": "00000000-0000-4000-8000-000000000001",
                    "origin": "Beirut",
                    "destination": "Tripoli",
                    "fuel_price_per_liter_lbp": 100000,
                },
            )

        assert response.status_code == 200
        assert response.json()["fuel_price_used_lbp"] == 100000.0
        assert response.json()["estimated_cost_lbp"] == 1000000.0
        mock_prices.assert_not_called()

    def test_maps_diesel_car_to_the_diesel_price(self):
        mock_supabase, captured = _mock_supabase_for_estimate(
            {"fuel_efficiency": 15, "fuel_type": "Diesel"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary"
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices"
        ) as mock_prices:
            mock_route.return_value = {
                "distance_km": 30.0,
                "duration_min": 20,
                "duration_in_traffic_min": 25,
            }
            mock_prices.return_value = {"diesel": 73300.0}

            response = client.post(
                "/trip-planner/estimate",
                json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "A", "destination": "B"},
            )

        assert response.status_code == 200
        assert response.json()["fuel_price_used_lbp"] == 73300.0

    def test_returns_404_for_a_car_that_is_not_the_callers_own(self):
        mock_supabase, _ = _mock_supabase_for_estimate(None)
        with patch("app.routers.trip_planner.supabase", mock_supabase):
            response = client.post(
                "/trip-planner/estimate",
                json={
                    "car_id": "00000000-0000-4000-8000-000000000002",
                    "origin": "Beirut",
                    "destination": "Tripoli",
                },
            )

        assert response.status_code == 404

    def test_returns_400_when_the_car_has_no_fuel_efficiency_set(self):
        mock_supabase, _ = _mock_supabase_for_estimate(
            {"fuel_efficiency": None, "fuel_type": "Gasoline"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase):
            response = client.post(
                "/trip-planner/estimate",
                json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "A", "destination": "B"},
            )

        assert response.status_code == 400
        assert "fuel efficiency" in response.json()["detail"].lower()

    def test_returns_400_for_an_electric_car_with_no_manual_price_override(self):
        mock_supabase, _ = _mock_supabase_for_estimate(
            {"fuel_efficiency": 6, "fuel_type": "Electric"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase):
            response = client.post(
                "/trip-planner/estimate",
                json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "A", "destination": "B"},
            )

        assert response.status_code == 400
        assert "electric" in response.json()["detail"].lower()

    def test_returns_a_clear_error_when_the_maps_lookup_fails(self):
        mock_supabase, _ = _mock_supabase_for_estimate(
            {"fuel_efficiency": 10, "fuel_type": "Gasoline"}
        )
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary"
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices"
        ) as mock_prices:
            mock_route.side_effect = GoogleMapsError("Could not find a route.")
            mock_prices.return_value = {"95_octane": 90000.0}

            response = client.post(
                "/trip-planner/estimate",
                json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "???", "destination": "!!!"},
            )

        assert response.status_code == 400
        assert response.json() == {"detail": "Could not find a route."}


def test_estimate_requires_authentication():
    # No dependency override here — hits the real get_current_user_id,
    # which requires a valid Authorization header.
    response = client.post(
        "/trip-planner/estimate",
        json={"car_id": "00000000-0000-4000-8000-000000000001", "origin": "A", "destination": "B"},
    )

    assert response.status_code == 401


# --- CAR-23: server-side input validation --------------------------------
# Every field is checked on the server regardless of what the UI allows: ids
# must be UUIDs (a malformed id is a 422, not a Postgres crash), places are
# trimmed and 1-300 characters, and a fuel price override is positive,
# bounded and finite. Rejected input must never reach the DB or Google.


class TestEstimateInputValidation:
    URL = "/trip-planner/estimate"
    CAR = "00000000-0000-4000-8000-000000000001"

    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def _post(self, body=None, raw=None):
        mock_supabase, captured = _mock_supabase_for_estimate(
            {"fuel_efficiency": 10, "fuel_type": "Gasoline"}
        )
        route = {"distance_km": 10.0, "duration_min": 10, "duration_in_traffic_min": 10}
        with patch("app.routers.trip_planner.supabase", mock_supabase), patch(
            "app.routers.trip_planner.get_route_summary", return_value=route
        ) as mock_route, patch(
            "app.routers.trip_planner.get_current_fuel_prices",
            return_value={"95_octane": 90000.0},
        ):
            if raw is not None:
                response = client.post(
                    self.URL, content=raw, headers={"Content-Type": "application/json"}
                )
            else:
                response = client.post(self.URL, json=body)
        return response, mock_supabase, captured, mock_route

    def _body(self, **over):
        body = {"car_id": self.CAR, "origin": "Beirut", "destination": "Tripoli"}
        body.update(over)
        return body

    @pytest.mark.parametrize("car_id", ["not-a-uuid", "car-1", "", "1", "' or 1=1 --", "0" * 200],
        ids=["not-a-uuid", "car-1", "empty", "one", "sql-injection", "200-zeros"])
    def test_a_malformed_car_id_is_a_422_and_touches_nothing(self, car_id):
        response, mock_supabase, captured, mock_route = self._post(self._body(car_id=car_id))

        assert response.status_code == 422
        mock_supabase.table.assert_not_called()
        mock_route.assert_not_called()
        assert captured == {}

    @pytest.mark.parametrize("field", ["destination", "origin"])
    @pytest.mark.parametrize("value", ["", "     ", "\t\n", "X" * 301, "X" * 200_000],
        ids=["empty", "spaces", "tab-newline", "301-chars", "200k-chars"])
    def test_blank_or_oversized_places_are_a_422_and_touch_nothing(self, field, value):
        response, mock_supabase, _, mock_route = self._post(self._body(**{field: value}))

        assert response.status_code == 422
        mock_supabase.table.assert_not_called()
        mock_route.assert_not_called()

    def test_a_place_of_exactly_300_characters_is_accepted_and_trimmed(self):
        response, _, captured, mock_route = self._post(
            self._body(destination="  " + "D" * 300 + "  ")
        )

        assert response.status_code == 200
        assert captured["row"]["destination"] == "D" * 300
        mock_route.assert_called_once_with("Beirut", "D" * 300)

    @pytest.mark.parametrize("price", [0, -1, -0.01, 10_000_001, 1e300, "abc", None])
    def test_an_invalid_fuel_price_override_is_a_422(self, price):
        if price is None:
            # null just means "use the default price" — accepted.
            response, *_ = self._post(self._body(fuel_price_per_liter_lbp=None))
            assert response.status_code == 200
            return
        response, mock_supabase, *_ = self._post(self._body(fuel_price_per_liter_lbp=price))

        assert response.status_code == 422
        mock_supabase.table.assert_not_called()

    @pytest.mark.parametrize("literal", ["Infinity", "-Infinity", "NaN"])
    def test_non_finite_fuel_prices_are_rejected(self, literal):
        raw = (
            '{"car_id": "%s", "origin": "Beirut", "destination": "Tripoli", '
            '"fuel_price_per_liter_lbp": %s}' % (self.CAR, literal)
        )

        response, mock_supabase, *_ = self._post(raw=raw)

        assert response.status_code == 422
        mock_supabase.table.assert_not_called()

    @pytest.mark.parametrize("price", [0.01, 140500, 10_000_000])
    def test_fuel_prices_inside_the_bounds_are_accepted(self, price):
        response, *_ = self._post(self._body(fuel_price_per_liter_lbp=price))

        assert response.status_code == 200


class TestDirectionsInputValidation:
    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    @pytest.mark.parametrize("field", ["destination", "origin"])
    @pytest.mark.parametrize("value", ["   ", "X" * 301, "X" * 200_000],
        ids=["spaces", "301-chars", "200k-chars"])
    def test_blank_or_oversized_places_are_a_422_and_never_reach_google(self, field, value):
        body = {"origin": "Beirut", "destination": "Tripoli"}
        body[field] = value
        with patch("app.routers.trip_planner.get_route_summary") as mock_route:
            response = client.post("/trip-planner/directions", json=body)

        assert response.status_code == 422
        mock_route.assert_not_called()
