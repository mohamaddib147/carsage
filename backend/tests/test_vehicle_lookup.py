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
import pytest

from app.services.vehicle_lookup import (
    get_spec_suggestions,
    lookup_api_ninjas,
    lookup_fuel_economy,
    lookup_nhtsa,
    match_nhtsa_model,
)


@pytest.fixture(autouse=True)
def _no_real_llm_calls():
    """get_spec_suggestions falls back to the auto-data.net lookup and then
    the LLM for a tank capacity; tests must never hit either for real."""
    with patch(
        "app.services.vehicle_lookup.lookup_tank_capacity", return_value=None
    ), patch("app.services.vehicle_lookup.estimate_tank_capacity", return_value=None):
        yield


def _mock_response(json_body):
    response = MagicMock()
    response.raise_for_status.side_effect = None
    response.json.return_value = json_body
    return response


def test_lookup_nhtsa_confirms_a_known_model_and_never_fills_engine_type():
    # engine_type is always None: vPIC has no free per-model engine-spec
    # endpoint, and an earlier version filled it with the vehicle's general
    # body class (e.g. "Passenger Car") instead, which was misleading under
    # an "Engine Type" label with a "✓ Auto-filled" tag (confirmed live).
    models_response = _mock_response(
        {"Results": [{"Model_Name": "Civic"}, {"Model_Name": "Accord"}]}
    )

    with patch("app.services.vehicle_lookup.httpx.get", return_value=models_response):
        result = lookup_nhtsa("Honda", "Civic", 2020)

    assert result == {
        "vehicle_confirmed": True,
        "engine_type": None,
        "model_name": "Civic",
    }


def test_lookup_nhtsa_reports_unconfirmed_for_an_unrecognized_model():
    models_response = _mock_response({"Results": [{"Model_Name": "Accord"}]})

    with patch("app.services.vehicle_lookup.httpx.get", return_value=models_response):
        result = lookup_nhtsa("Honda", "NotARealModel", 2020)

    assert result == {"vehicle_confirmed": False, "engine_type": None, "model_name": None}


def test_lookup_nhtsa_never_raises_on_a_network_failure():
    with patch(
        "app.services.vehicle_lookup.httpx.get",
        side_effect=httpx.ConnectError("boom"),
    ):
        result = lookup_nhtsa("Honda", "Civic", 2020)

    assert result == {"vehicle_confirmed": False, "engine_type": None, "model_name": None}


def test_lookup_nhtsa_recognizes_a_badge_that_nhtsa_files_under_its_model_family():
    # Reported in testing: a saved Mercedes-Benz "C230 Kompressor" (2005) was
    # called unknown to NHTSA, which lists it as "C-Class".
    models_response = _mock_response(
        {"Results": [{"Model_Name": "C-Class"}, {"Model_Name": "CLK-Class"}, {"Model_Name": "E-Class"}]}
    )

    with patch("app.services.vehicle_lookup.httpx.get", return_value=models_response):
        result = lookup_nhtsa("Mercedes-Benz", "C230 Kompressor", 2005)

    assert result == {
        "vehicle_confirmed": True,
        "engine_type": None,
        "model_name": "C-Class",
    }


@pytest.mark.parametrize(
    "typed, official_names, expected",
    [
        # same name, any case / spacing
        ("civic", ["Civic", "Accord"], "Civic"),
        ("  Grand   Cherokee ", ["Grand Cherokee", "Cherokee"], "Grand Cherokee"),
        # official name + a trim; the longest official name wins
        ("Camry LE", ["Camry", "Avalon"], "Camry"),
        ("Civic-Si", ["Civic", "Accord"], "Civic"),
        ("Corolla Cross LE", ["Corolla", "Corolla Cross"], "Corolla Cross"),
        # model families: badge letter/number + digits
        ("C230 Kompressor", ["C-Class", "E-Class", "CLK-Class"], "C-Class"),
        ("c320", ["C-Class", "E-Class"], "C-Class"),
        ("E350", ["C-Class", "E-Class"], "E-Class"),
        ("ML350", ["M-Class", "ML-Class", "GL-Class"], "ML-Class"),
        ("328i", ["3 Series", "5 Series"], "3 Series"),
        # the longer family letter wins, so a CL isn't read as a C
        ("CL500", ["C-Class", "CL-Class"], "CL-Class"),
        ("CLK320", ["C-Class", "CLK-Class"], "CLK-Class"),
        ("GLK350", ["GL-Class", "GLK-Class"], "GLK-Class"),
        # things that must NOT match
        ("Civic", ["Civic Type R", "Accord"], None),
        ("CLK320", ["C-Class", "E-Class"], None),
        ("Corolla", ["Camry", "Avalon"], None),
        ("Crv", ["C-Class"], None),
        ("C", ["C-Class"], None),
        ("", ["Civic"], None),
        ("Civic", [], None),
        ("Civic", ["", None], None),
    ],
)
def test_match_nhtsa_model(typed, official_names, expected):
    assert match_nhtsa_model(typed, official_names) == expected


def test_spec_suggestions_response_does_not_expose_the_internal_model_name():
    with patch(
        "app.services.vehicle_lookup.lookup_nhtsa",
        return_value={"vehicle_confirmed": True, "engine_type": None, "model_name": "C-Class"},
    ), patch(
        "app.services.vehicle_lookup.lookup_api_ninjas",
        return_value={"fuel_efficiency": None, "cylinders": None, "drivetrain": None, "transmission": None},
    ), patch(
        "app.services.vehicle_lookup.lookup_fuel_economy", return_value=None
    ), patch("app.services.vehicle_lookup.lookup_tank_capacity", return_value=None), patch(
        "app.services.vehicle_lookup.estimate_tank_capacity", return_value=None
    ):
        result = get_spec_suggestions("Mercedes-Benz", "C230 Kompressor", 2005)

    assert result["vehicle_confirmed"] is True
    assert "model_name" not in result


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
        "fuel_tank_capacity_liters": None,
    }


def test_lookup_api_ninjas_returns_all_none_without_a_configured_key(monkeypatch):
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "")

    result = lookup_api_ninjas("Honda", "Civic", 2020)

    assert result == {
        "fuel_efficiency": None,
        "cylinders": None,
        "drivetrain": None,
        "transmission": None,
        "fuel_tank_capacity_liters": None,
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
        "fuel_tank_capacity_liters": None,
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
        "fuel_tank_capacity_liters": None,
    }


def test_lookup_api_ninjas_picks_up_a_tank_capacity_when_the_response_has_one(monkeypatch):
    # CAR-44: API Ninjas doesn't document a tank field, so any key with
    # "tank" and a positive number is accepted.
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "test-key")
    response = _mock_response(
        [{"cylinders": 4, "drive": "fwd", "transmission": "a", "fuel_tank_capacity": 50}]
    )

    with patch("app.services.vehicle_lookup.httpx.get", return_value=response):
        result = lookup_api_ninjas("Honda", "Civic", 2020)

    assert result["fuel_tank_capacity_liters"] == 50.0


def test_lookup_api_ninjas_ignores_a_premium_placeholder_or_nonpositive_tank_value(
    monkeypatch,
):
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "test-key")

    for bad_value in ("this field is for premium subscribers only", 0, -5, True, None):
        response = _mock_response([{"cylinders": 4, "fuel_tank_capacity": bad_value}])
        with patch("app.services.vehicle_lookup.httpx.get", return_value=response):
            result = lookup_api_ninjas("Honda", "Civic", 2020)
        assert result["fuel_tank_capacity_liters"] is None, bad_value


def test_lookup_api_ninjas_drops_a_tank_value_outside_the_5_to_200_litre_range(
    monkeypatch,
):
    # CAR-49: a mis-scaled value (e.g. 430, or 3 from a unit mix-up) must
    # never be autofilled; the boundaries themselves are accepted.
    monkeypatch.setattr("app.services.vehicle_lookup.API_NINJAS_KEY", "test-key")

    for value, expected in ((430, None), (4.9, None), (200.5, None), (5, 5.0), (200, 200.0)):
        response = _mock_response([{"cylinders": 4, "fuel_tank_capacity": value}])
        with patch("app.services.vehicle_lookup.httpx.get", return_value=response):
            result = lookup_api_ninjas("Honda", "Civic", 2020)
        assert result["fuel_tank_capacity_liters"] == expected, value


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
        return_value={"vehicle_confirmed": True, "engine_type": None},
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
        "engine_type": None,
        "fuel_efficiency": 14.5,
        "cylinders": 4,
        "drivetrain": "fwd",
        "transmission": "a",
        "fuel_tank_capacity_liters": None,
        "fuel_tank_capacity_source": None,
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


def _ninjas(tank):
    return {
        "fuel_efficiency": None,
        "cylinders": 4,
        "drivetrain": "fwd",
        "transmission": "a",
        "fuel_tank_capacity_liters": tank,
    }


def _suggestions(*, ninjas_tank=None, lookup_tank=None, estimate=None):
    """Runs get_spec_suggestions with each tank source stubbed; returns
    (result, lookup mock, estimate mock)."""
    with patch("app.services.vehicle_lookup.lookup_nhtsa", return_value={}), patch(
        "app.services.vehicle_lookup.lookup_api_ninjas", return_value=_ninjas(ninjas_tank)
    ), patch("app.services.vehicle_lookup.lookup_fuel_economy", return_value=None), patch(
        "app.services.vehicle_lookup.lookup_tank_capacity", return_value=lookup_tank
    ) as mock_lookup, patch(
        "app.services.vehicle_lookup.estimate_tank_capacity", return_value=estimate
    ) as mock_estimate:
        result = get_spec_suggestions("Toyota", "Camry", 2016)
    return result, mock_lookup, mock_estimate


def test_get_spec_suggestions_uses_the_real_spec_sheet_lookup_first():
    result, mock_lookup, mock_estimate = _suggestions(lookup_tank=64.0, estimate=99.0)

    mock_lookup.assert_called_once_with("Toyota", "Camry", 2016)
    mock_estimate.assert_not_called()  # a real value means no AI guess
    assert result["fuel_tank_capacity_liters"] == 64.0
    assert result["fuel_tank_capacity_source"] == "auto_data"


def test_get_spec_suggestions_prefers_a_value_from_api_ninjas_over_everything():
    result, mock_lookup, mock_estimate = _suggestions(
        ninjas_tank=50.0, lookup_tank=64.0, estimate=99.0
    )

    # The spec-sheet lookup runs in parallel (speculatively), so it may have
    # been called; what matters is that its value is ignored.
    mock_estimate.assert_not_called()
    assert result["fuel_tank_capacity_liters"] == 50.0
    assert result["fuel_tank_capacity_source"] == "api_ninjas"


def test_get_spec_suggestions_falls_back_to_an_ai_estimate_only_when_the_lookup_finds_nothing():
    result, mock_lookup, mock_estimate = _suggestions(lookup_tank=None, estimate=62.1)

    mock_lookup.assert_called_once()
    mock_estimate.assert_called_once_with("Toyota", "Camry", 2016)
    assert result["fuel_tank_capacity_liters"] == 62.1
    assert result["fuel_tank_capacity_source"] == "ai_estimate"


def test_get_spec_suggestions_leaves_the_tank_empty_when_nothing_finds_one():
    result, _, _ = _suggestions()

    assert result["fuel_tank_capacity_liters"] is None
    assert result["fuel_tank_capacity_source"] is None


# --- CAR-23: user input in outbound URLs ------------------------------------


@pytest.mark.parametrize(
    "make",
    ["Honda/../../admin", "Honda?evil=1", "Honda#frag", "Ho nda", "a%2Fb", "../x", "Honda\\x"],
)
def test_lookup_nhtsa_percent_encodes_the_make_so_it_cannot_alter_the_url_path(make):
    captured = []

    def fake_get(url, **kwargs):
        captured.append(url)
        return _mock_response({"Results": []})

    with patch("app.services.vehicle_lookup.httpx.get", side_effect=fake_get):
        lookup_nhtsa(make, "Civic", 2020)

    url = captured[0]
    assert url.startswith("https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/")
    make_segment = url.split("/make/")[1].split("/modelyear/")[0]
    # Nothing that could add a path segment, a query or a fragment survives raw.
    assert not any(char in make_segment for char in "/?#\\ ")
    assert url.endswith("/modelyear/2020")
    assert url.count("/modelyear/") == 1
