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
import pytest

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
    # Two shared symptom words (grinding + vibrating) -> 3 complaints is enough.
    matching_complaint = {"components": "BRAKES", "summary": "Brakes grind loudly and vibrate."}
    recalls = _recalls([])
    complaints = _complaints([matching_complaint] * 3)

    with patch(
        "app.services.nhtsa_safety.httpx.get", side_effect=[recalls, complaints]
    ):
        result = check_safety_data(
            "Honda", "Civic", 2015, "Brakes are grinding and vibrating"
        )

    assert result == {
        "status": "complaint_pattern",
        "count": 3,
        "summary": "Brakes grind loudly and vibrate.",
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


# --- CAR-22: matching precision ------------------------------------------
# The original matcher treated any 4+ letter word shared with a recall's or
# complaint's free text as a match, so everyday words ("right", "after",
# "engine") produced false "NHTSA recall / complaint pattern" claims for
# unrelated problems. These pin down the corrected behavior.


def _check(recalls, complaints, description, vpic_confirmed=True):
    with patch(
        "app.services.nhtsa_safety.httpx.get",
        side_effect=[_recalls(recalls), _complaints(complaints)],
    ), patch(
        "app.services.nhtsa_safety.lookup_nhtsa",
        return_value={"vehicle_confirmed": vpic_confirmed, "engine_type": None},
    ):
        return check_safety_data("Toyota", "Camry", 2016, description)


AIRBAG_RECALL = {
    "Component": "AIR BAGS:SENSOR:OCCUPANT CLASSIFICATION",
    "Summary": "Toyota is recalling certain vehicles. The right front seat sensor may fail after impact.",
}
NOISY_COMPLAINTS = [
    {"components": "ENGINE", "summary": "After the right turn the check engine light came on, I think the engine is loose."}
] * 5


def test_an_unrelated_description_is_not_matched_on_everyday_words():
    # Words like "right", "after", "think", "loose" all appear in the recall
    # and complaint text below, but the description is about a cup holder —
    # no vehicle system — so nothing may match.
    result = _check(
        [AIRBAG_RECALL], NOISY_COMPLAINTS, "The cup holder is cracked on the right side after I sat on it, I think"
    )

    assert result == {"status": "no_match"}


def test_a_recall_in_a_different_system_does_not_match():
    result = _check([AIRBAG_RECALL], [], "My wipers leave streaks on the windshield")

    assert result == {"status": "no_match"}


def test_a_safety_critical_system_recall_always_surfaces_and_names_the_system():
    recall = {"Component": "SERVICE BRAKES, HYDRAULIC", "Summary": "Brake fluid may leak from the master cylinder."}

    result = _check([recall], [], "My brakes squeak a little in the morning")

    assert result["status"] == "recall_match"
    assert result["system"] == "brakes"
    assert "master cylinder" in result["summary"]


def test_a_non_critical_system_recall_needs_a_shared_symptom_to_match():
    recall = {"Component": "ELECTRICAL SYSTEM:WIRING", "Summary": "A wiring harness may chafe and cause a short circuit."}

    # Dead battery: same system (electrical) but nothing in common with the recall text.
    assert _check([recall], [], "My battery is dead this morning") == {"status": "no_match"}
    # Same system AND a shared symptom ("short circuit") -> surfaces.
    assert _check([recall], [], "There seems to be a short circuit that keeps blowing my fuse")["status"] == "recall_match"


def test_complaints_in_another_system_never_count_even_with_matching_words():
    complaints = [{"components": "ENGINE", "summary": "The brakes squeak and squeal"}] * 5

    assert _check([], complaints, "My brakes squeak") == {"status": "no_match"}


def test_a_complaint_pattern_needs_the_symptom_not_just_the_system():
    # Five brake complaints, but about a soft pedal — not the squeak described.
    complaints = [{"components": "SERVICE BRAKES", "summary": "Brake pedal feels soft and spongy."}] * 5

    assert _check([], complaints, "My brakes squeak when cold") == {"status": "no_match"}


def test_a_complaint_pattern_needs_two_shared_symptoms_when_the_description_has_several():
    only_one = [{"components": "SERVICE BRAKES", "summary": "Pedal is soft."}] * 4
    both = [{"components": "SERVICE BRAKES", "summary": "Pedal is soft and sinks to the floor."}] * 4
    description = "My brake pedal is soft and sinks to the floor"

    assert _check([], only_one, description) == {"status": "no_match"}
    result = _check([], both, description)
    assert result["status"] == "complaint_pattern"
    assert result["count"] == 4


def test_a_description_with_no_recognizable_system_never_matches_but_still_reports_not_found():
    recall = {"Component": "SERVICE BRAKES", "Summary": "Something about noise."}

    assert _check([recall], [], "It makes a weird noise sometimes") == {"status": "no_match"}
    # With no NHTSA data at all and an unrecognized vehicle, "not found" still wins.
    assert _check([], [], "It makes a weird noise", vpic_confirmed=False) == {"status": "not_found"}


@pytest.mark.parametrize(
    "description, expected_system",
    [
        ("airbag warning light is on", "air bags"),
        ("power steering suddenly stopped working", "steering"),
        ("I can smell gasoline near the back", "fuel system"),
        ("the seatbelt will not retract", "seat belts"),
        ("my front tire keeps losing air", "tires"),
    ],
)
def test_recognizes_the_safety_critical_systems_from_everyday_wording(description, expected_system):
    from app.services.nhtsa_safety import _systems_in

    assert expected_system in [entry[0] for entry in _systems_in(description)]


def test_a_single_shared_symptom_word_takes_twice_the_complaints_to_count_as_a_pattern():
    complaint = {"components": "SERVICE BRAKES", "summary": "Brakes squeal when applied."}

    # Description has ONE symptom word ("squeal"): 3-5 complaints isn't enough...
    assert _check([], [complaint] * 5, "My brakes squeal") == {"status": "no_match"}
    # ...but 6 (twice the threshold) is.
    result = _check([], [complaint] * 6, "My brakes squeal")
    assert result["status"] == "complaint_pattern"
    assert result["count"] == 6
