# Tests check_safety_data: a matching open recall, a complaint pattern
# (at and just below the threshold), no match with a vehicle NHTSA
# vPIC confirms exists, no match with a vehicle vPIC doesn't recognize
# ("not_found" — the whole reason this reuses vehicle_lookup.lookup_nhtsa,
# since Recalls/Complaints alone can't tell "unknown vehicle" apart from
# "clean record"), a real NHTSA quirk (HTTP 400 with a well-formed empty
# body — confirmed live, must not be mistaken for a failure), and a
# genuine failure (network error, or an unparseable body). All outbound
# httpx calls are mocked so these never hit the real APIs.

from unittest.mock import MagicMock, patch

import httpx

from app.services.nhtsa_safety import check_safety_data


def _mock_response(json_body, status_code=200):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body
    return response


def _recalls(results):
    return _mock_response({"Count": len(results), "results": results})


def _complaints(results):
    return _mock_response({"count": len(results), "results": results})


def test_returns_recall_match_when_a_recall_matches_the_description():
    recalls = _recalls(
        [
            {
                "Component": "STEERING",
                "Summary": "The power steering may fail unexpectedly.",
            }
        ]
    )
    complaints = _complaints([])

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ):
        result = check_safety_data(
            "Honda", "Civic", 2015, "My steering wheel locks up sometimes"
        )

    assert result["status"] == "recall_match"
    assert "steering" in result["summary"].lower()


def test_returns_complaint_pattern_when_matches_meet_the_threshold():
    matching_complaint = {"components": "BRAKES", "summary": "Brakes grind loudly."}
    recalls = _recalls([])
    complaints = _complaints([matching_complaint] * 3)

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ):
        result = check_safety_data("Honda", "Civic", 2015, "Brakes are grinding")

    assert result == {
        "status": "complaint_pattern",
        "count": 3,
        "summary": "Brakes grind loudly.",
    }


def test_does_not_treat_a_couple_of_matching_complaints_as_a_pattern():
    matching_complaint = {"components": "BRAKES", "summary": "Brakes grind loudly."}
    recalls = _recalls([])
    complaints = _complaints([matching_complaint] * 2)

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ), patch(
        "app.services.nhtsa_safety.lookup_nhtsa",
        return_value={"vehicle_confirmed": True, "engine_type": None},
    ):
        result = check_safety_data("Honda", "Civic", 2015, "Brakes are grinding")

    assert result == {"status": "no_match"}


def test_returns_no_match_when_data_exists_but_nothing_matches():
    recalls = _recalls([{"Component": "AIRBAGS", "Summary": "Airbag deployment issue."}])
    complaints = _complaints([])

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ):
        result = check_safety_data("Honda", "Civic", 2015, "AC is blowing warm air")

    assert result == {"status": "no_match"}


def test_returns_not_found_when_both_are_empty_and_vpic_does_not_confirm_the_vehicle():
    recalls = _recalls([])
    complaints = _complaints([])

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ), patch(
        "app.services.nhtsa_safety.lookup_nhtsa",
        return_value={"vehicle_confirmed": False, "engine_type": None},
    ) as mock_vpic:
        result = check_safety_data(
            "Mercedes-Benz", "C230", 2005, "Squeaking brakes when cold"
        )

    assert result == {"status": "not_found"}
    mock_vpic.assert_called_once_with("Mercedes-Benz", "C230", 2005)


def test_returns_no_match_when_both_are_empty_but_vpic_confirms_the_vehicle():
    recalls = _recalls([])
    complaints = _complaints([])

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ), patch(
        "app.services.nhtsa_safety.lookup_nhtsa",
        return_value={"vehicle_confirmed": True, "engine_type": "Passenger Car"},
    ):
        result = check_safety_data("Honda", "Civic", 2015, "AC is blowing warm air")

    assert result == {"status": "no_match"}


def test_returns_unavailable_on_a_recalls_api_failure():
    with patch(
        "app.services.nhtsa_safety.httpx.get",
        side_effect=httpx.ConnectError("boom"),
    ):
        result = check_safety_data("Honda", "Civic", 2015, "Brakes are grinding")

    assert result == {"status": "unavailable"}


def test_returns_unavailable_on_a_complaints_api_failure():
    recalls = _recalls([])

    with patch(
        "app.services.nhtsa_safety.httpx.get",
        side_effect=[recalls, httpx.ConnectError("boom")],
    ):
        result = check_safety_data("Honda", "Civic", 2015, "Brakes are grinding")

    assert result == {"status": "unavailable"}


def test_returns_unavailable_when_the_response_body_is_not_valid_json():
    bad_response = MagicMock()
    bad_response.json.side_effect = ValueError("not valid json")

    with patch("app.services.nhtsa_safety.httpx.get", return_value=bad_response):
        result = check_safety_data("Honda", "Civic", 2015, "Brakes are grinding")

    assert result == {"status": "unavailable"}


def test_treats_a_400_status_with_a_well_formed_empty_body_as_zero_results():
    # Confirmed live against the real API: both recallsByVehicle and
    # complaintsByVehicle return HTTP 400 — not 200 — specifically when
    # the result set is legitimately empty, even though the body itself
    # is well-formed ({"Count": 0, "Message": "Results returned
    # successfully", "results": []}). This must be treated the same as
    # a normal empty result, never as a failure.
    recalls = _mock_response(
        {"Count": 0, "Message": "Results returned successfully", "results": []},
        status_code=400,
    )
    complaints = _mock_response(
        {"count": 0, "message": "Results returned successfully", "results": []},
        status_code=400,
    )

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ), patch(
        "app.services.nhtsa_safety.lookup_nhtsa",
        return_value={"vehicle_confirmed": True, "engine_type": None},
    ):
        result = check_safety_data(
            "Mercedes-Benz", "C230 Kompressor", 2005, "Squeaking brakes when cold"
        )

    assert result == {"status": "no_match"}
