# Tests the NHTSA vPIC + API Ninjas + fueleconomy.gov spec-autofill
# lookups: a confirmed vehicle with a resolvable vehicle type, an
# unrecognized model (no match), a network failure, API Ninjas with/
# without a configured key, no API Ninjas match, fueleconomy.gov's menu
# walk (normal case + its "single result collapses to an object, not a
# list" quirk + no match), and the combined get_spec_suggestions merge
# (including its API-Ninjas-then-fueleconomy.gov fallback for
# fuel_efficiency, since API Ninjas gates MPG behind a paid tier). All
# outbound httpx calls are mocked so these never hit the real APIs.

from unittest.mock import MagicMock, patch

import httpx

from app.services.vehicle_lookup import (
    get_spec_suggestions,
    lookup_api_ninjas,
    lookup_fuel_economy,
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


def test_lookup_fuel_economy_walks_the_menu_and_converts_to_km_per_liter():
    models_response = _mock_response(
        {"menuItem": [{"text": "C230", "value": "C230"}, {"text": "C280", "value": "C280"}]}
    )
    # A single matching trim/engine option collapses to a bare object
    # (not a one-item list) in fueleconomy.gov's XML->JSON conversion.
    options_response = _mock_response(
        {"menuItem": {"text": "Auto 7-spd, 6 cyl, 2.5 L", "value": "21824"}}
    )
    detail_response = _mock_response({"comb08": 22})

    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=[models_response, options_response, detail_response],
    ):
        result = lookup_fuel_economy("Mercedes-Benz", "C230", 2006)

    assert result == round(22 * 1.60934 / 3.78541, 1)


def test_lookup_fuel_economy_returns_none_when_the_model_has_no_match():
    models_response = _mock_response({"menuItem": [{"text": "C280", "value": "C280"}]})

    with patch("app.services.vehicle_lookup.httpx.get", return_value=models_response):
        result = lookup_fuel_economy("Mercedes-Benz", "NotARealModel", 2006)

    assert result is None


def test_lookup_fuel_economy_matches_a_trim_qualified_model_name():
    # fueleconomy.gov lists some years' trims under a longer name (e.g. a
    # 2005 "C230" is listed as "C230 Kompressor") — a plain "C230" search
    # must still find it via the startswith match, picking the shortest
    # (plainest) candidate over e.g. a "(Wagon)" variant.
    models_response = _mock_response(
        {
            "menuItem": [
                {"text": "C230 Kompressor Sports Coupe", "value": "x"},
                {"text": "C230 Kompressor", "value": "x"},
                {"text": "C240 4matic", "value": "x"},
            ]
        }
    )
    options_response = _mock_response({"menuItem": {"text": "Auto 5-spd", "value": "999"}})
    detail_response = _mock_response({"comb08": 22})

    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=[models_response, options_response, detail_response],
    ) as mock_get:
        result = lookup_fuel_economy("Mercedes-Benz", "C230", 2005)

    assert result == round(22 * 1.60934 / 3.78541, 1)
    assert mock_get.call_args_list[1].kwargs["params"]["model"] == "C230 Kompressor"


def test_lookup_fuel_economy_returns_none_for_an_unrecognized_make_or_year():
    # fueleconomy.gov's model-menu endpoint returns the literal JSON body
    # `null` (not an empty object) when the make/year combo has no menu at
    # all — this must not crash the lookup.
    with patch(
        "app.services.vehicle_lookup.httpx.get", return_value=_mock_response(None)
    ):
        result = lookup_fuel_economy("Mercedes", "C230", 2005)

    assert result is None


def test_lookup_fuel_economy_never_raises_on_a_network_failure():
    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=httpx.ConnectError("boom"),
    ):
        result = lookup_fuel_economy("Mercedes-Benz", "C230", 2006)

    assert result is None


def test_get_spec_suggestions_merges_all_lookups_and_falls_back_to_fueleconomy_gov():
    with patch(
        "app.services.vehicle_lookup.lookup_nhtsa",
        return_value={"vehicle_confirmed": True, "engine_type": "Passenger Car"},
    ) as mock_nhtsa, patch(
        "app.services.vehicle_lookup.lookup_api_ninjas",
        # Matches real API Ninjas free-tier behavior: fuel_efficiency is
        # None (MPG is paywalled) even though other fields come through.
        return_value={
            "fuel_efficiency": None,
            "cylinders": 4,
            "drivetrain": "fwd",
            "transmission": "a",
        },
    ) as mock_ninjas, patch(
        "app.services.vehicle_lookup.lookup_fuel_economy", return_value=14.5
    ) as mock_fuel_economy:
        result = get_spec_suggestions("Honda", "Civic", 2020)

    mock_nhtsa.assert_called_once_with("Honda", "Civic", 2020)
    mock_ninjas.assert_called_once_with("Honda", "Civic", 2020)
    mock_fuel_economy.assert_called_once_with("Honda", "Civic", 2020)
    assert result == {
        "vehicle_confirmed": True,
        "engine_type": "Passenger Car",
        "fuel_efficiency": 14.5,
        "cylinders": 4,
        "drivetrain": "fwd",
        "transmission": "a",
    }


def test_get_spec_suggestions_prefers_api_ninjas_fuel_efficiency_when_present():
    with patch("app.services.vehicle_lookup.lookup_nhtsa", return_value={}), patch(
        "app.services.vehicle_lookup.lookup_api_ninjas",
        return_value={
            "fuel_efficiency": 20.0,
            "cylinders": 4,
            "drivetrain": "fwd",
            "transmission": "a",
        },
    ), patch("app.services.vehicle_lookup.lookup_fuel_economy") as mock_fuel_economy:
        result = get_spec_suggestions("Honda", "Civic", 2020)

    mock_fuel_economy.assert_not_called()
    assert result["fuel_efficiency"] == 20.0
