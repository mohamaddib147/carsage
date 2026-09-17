# Tests the NHTSA vPIC + API Ninjas spec-autofill lookups: a confirmed
# vehicle with a resolvable vehicle type, an unrecognized model (no
# match), a network failure, API Ninjas with/without a configured key,
# no API Ninjas match, and the combined get_spec_suggestions merge. All
# outbound httpx calls are mocked so these never hit the real APIs.

from unittest.mock import MagicMock, patch

import httpx

from app.services.vehicle_lookup import (
    get_spec_suggestions,
    lookup_api_ninjas,
    lookup_nhtsa,
)


def _mock_response(json_body):
    response = MagicMock()
    response.raise_for_status.side_effect = None
    response.json.return_value = json_body
    return response


def test_lookup_nhtsa_confirms_a_known_model_and_returns_a_vehicle_type():
    models_response = _mock_response(
        {"Results": [{"Model_Name": "Civic"}, {"Model_Name": "Accord"}]}
    )
    types_response = _mock_response(
        {"Results": [{"VehicleTypeName": "Passenger Car"}]}
    )

    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=[models_response, types_response],
    ):
        result = lookup_nhtsa("Honda", "Civic", 2020)

    assert result == {"vehicle_confirmed": True, "engine_type": "Passenger Car"}


def test_lookup_nhtsa_reports_unconfirmed_for_an_unrecognized_model():
    models_response = _mock_response({"Results": [{"Model_Name": "Accord"}]})

    with patch("app.services.vehicle_lookup.httpx.get", return_value=models_response):
        result = lookup_nhtsa("Honda", "NotARealModel", 2020)

    assert result == {"vehicle_confirmed": False, "engine_type": None}


def test_lookup_nhtsa_never_raises_on_a_network_failure():
    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=httpx.ConnectError("boom"),
    ):
        result = lookup_nhtsa("Honda", "Civic", 2020)

    assert result == {"vehicle_confirmed": False, "engine_type": None}


def test_lookup_api_ninjas_converts_mpg_to_km_per_liter(monkeypatch):
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "test-key")
    response = _mock_response(
        [
            {
                "combination_mpg": 34,
                "cylinders": 4,
                "drive": "fwd",
                "transmission": "a",
            }
        ]
    )

    with patch("app.services.vehicle_lookup.httpx.get", return_value=response):
        result = lookup_api_ninjas("Honda", "Civic", 2020)

    assert result == {
        "fuel_efficiency": round(34 * 1.60934 / 3.78541, 1),
        "cylinders": 4,
        "drivetrain": "fwd",
        "transmission": "a",
    }


def test_lookup_api_ninjas_returns_all_none_without_a_configured_key(monkeypatch):
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "")

    result = lookup_api_ninjas("Honda", "Civic", 2020)

    assert result == {
        "fuel_efficiency": None,
        "cylinders": None,
        "drivetrain": None,
        "transmission": None,
    }


def test_lookup_api_ninjas_returns_all_none_when_there_is_no_match(monkeypatch):
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "test-key")
    response = _mock_response([])

    with patch("app.services.vehicle_lookup.httpx.get", return_value=response):
        result = lookup_api_ninjas("Honda", "SomeCarNotSoldInUS", 2020)

    assert result == {
        "fuel_efficiency": None,
        "cylinders": None,
        "drivetrain": None,
        "transmission": None,
    }


def test_lookup_api_ninjas_never_raises_on_a_network_failure(monkeypatch):
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "test-key")

    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=httpx.ConnectError("boom"),
    ):
        result = lookup_api_ninjas("Honda", "Civic", 2020)

    assert result == {
        "fuel_efficiency": None,
        "cylinders": None,
        "drivetrain": None,
        "transmission": None,
    }


def test_get_spec_suggestions_merges_both_lookups():
    with patch(
        "app.services.vehicle_lookup.lookup_nhtsa",
        return_value={"vehicle_confirmed": True, "engine_type": "Passenger Car"},
    ) as mock_nhtsa, patch(
        "app.services.vehicle_lookup.lookup_api_ninjas",
        return_value={
            "fuel_efficiency": 14.5,
            "cylinders": 4,
            "drivetrain": "fwd",
            "transmission": "a",
        },
    ) as mock_ninjas:
        result = get_spec_suggestions("Honda", "Civic", 2020)

    mock_nhtsa.assert_called_once_with("Honda", "Civic", 2020)
    mock_ninjas.assert_called_once_with("Honda", "Civic", 2020)
    assert result == {
        "vehicle_confirmed": True,
        "engine_type": "Passenger Car",
        "fuel_efficiency": 14.5,
        "cylinders": 4,
        "drivetrain": "fwd",
        "transmission": "a",
    }
