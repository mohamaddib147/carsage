# Tests POST /ai-advisor/classify: the normal flow (car ownership check,
# a new conversation + both messages persisted, LLM classification),
# appending to an existing conversation, a conversation that isn't the
# caller's own, a car that isn't the caller's own, the user's message
# still being saved when the LLM service fails (surfacing a clear 503),
# missing/empty description validation, missing authentication, the
# CAR-40 YouTube video wiring (saved + returned on a 'diy' match, absent
# on no match, and never even looked up for 'mechanic'), and the CAR-36
# NHTSA safety-data wiring (a recall/complaint match skips the LLM and
# forces 'mechanic', a vehicle NHTSA doesn't recognize gets a disclaimer
# appended to the normal LLM guidance, and an unreachable NHTSA API
# falls back to the normal LLM path unchanged).
#
# check_safety_data is auto-mocked to "no_match" for every test in this
# file except TestNHTSASafetyWiring, so the pre-CAR-36 tests exercise
# exactly the same path they did before that task — the NHTSA check
# simply wasn't there yet.

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.services.llm_client import LLMError

client = TestClient(app)


@pytest.fixture(autouse=True)
def _default_no_safety_match():
    with patch(
        "app.routers.ai_advisor.check_safety_data", return_value={"status": "no_match"}
    ):
        yield


def _build_mock_supabase(
    car_data, conversation_lookup_data=None, new_conversation_id="conv-1"
):
    """
    Mocks supabase.table(...) for "cars" (ownership check),
    "advisor_conversations" (lookup-by-id for an existing conversation,
    or insert for a new one), and "advisor_messages" (insert and update,
    each capturing every row). Matches supabase-py's real behavior where
    maybe_single().execute() returns None outright (not a response
    object with .data=None) when nothing matches.

    Returns (mock_supabase, captured_inserts, captured_updates) — each
    captured_updates entry is {"id": <message id>, **update_fields}.
    """
    mock_supabase = MagicMock()

    cars_table = MagicMock()
    cars_table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        MagicMock(data=car_data) if car_data is not None else None
    )

    conversations_table = MagicMock()
    conversations_table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        MagicMock(data=conversation_lookup_data)
        if conversation_lookup_data is not None
        else None
    )
    conversations_table.insert.return_value.execute.return_value = MagicMock(
        data=[{"id": new_conversation_id}]
    )

    messages_table = MagicMock()
    captured_inserts = []
    captured_updates = []
    counter = {"n": 0}

    def insert_message(row):
        captured_inserts.append(row)
        counter["n"] += 1
        message_id = f"msg-{counter['n']}"
        result = MagicMock()
        result.execute.return_value = MagicMock(data=[{"id": message_id, **row}])
        return result

    messages_table.insert.side_effect = insert_message

    def update_message(row):
        update_builder = MagicMock()

        def eq(_field, message_id):
            captured_updates.append({"id": message_id, **row})
            eq_builder = MagicMock()
            eq_builder.execute.return_value = MagicMock(
                data=[{"id": message_id, **row}]
            )
            return eq_builder

        update_builder.eq.side_effect = eq
        return update_builder

    messages_table.update.side_effect = update_message

    mock_supabase.table.side_effect = lambda name: {
        "cars": cars_table,
        "advisor_conversations": conversations_table,
        "advisor_messages": messages_table,
    }[name]

    return mock_supabase, captured_inserts, captured_updates


class TestPostClassify:
    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def test_returns_the_classification_and_persists_both_messages_in_a_new_conversation(
        self,
    ):
        mock_supabase, captured, _ = _build_mock_supabase(
            {"make": "Toyota", "model": "Corolla", "year": 2020}
        )
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify, patch(
            "app.routers.ai_advisor.search_diy_video", return_value=None
        ):
            mock_classify.return_value = {
                "recommendation": "diy",
                "guidance": "Top up the washer fluid.",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Washer fluid light is on"},
            )

        assert response.status_code == 200
        assert response.json() == {
            "conversation_id": "conv-1",
            "recommendation": "diy",
            "guidance": "Top up the washer fluid.",
            "video_title": None,
            "video_url": None,
        }
        mock_classify.assert_called_once_with(
            "Washer fluid light is on",
            {"make": "Toyota", "model": "Corolla", "year": 2020},
        )
        assert captured == [
            {
                "conversation_id": "conv-1",
                "sender": "user",
                "message_text": "Washer fluid light is on",
            },
            {
                "conversation_id": "conv-1",
                "sender": "ai",
                "message_text": "Top up the washer fluid.",
                "recommendation": "diy",
            },
        ]

    def test_appends_to_an_existing_conversation_when_conversation_id_is_provided(self):
        mock_supabase, captured, _ = _build_mock_supabase(
            {"make": "Honda"}, conversation_lookup_data={"id": "conv-2"}
        )
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify:
            mock_classify.return_value = {
                "recommendation": "mechanic",
                "guidance": "See a mechanic.",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={
                    "car_id": "car-1",
                    "description": "Still squeaking",
                    "conversation_id": "conv-2",
                },
            )

        assert response.status_code == 200
        assert response.json()["conversation_id"] == "conv-2"
        assert all(row["conversation_id"] == "conv-2" for row in captured)
        # No new conversation was created — only the two message inserts.
        mock_supabase.table("advisor_conversations").insert.assert_not_called()

    def test_returns_404_for_a_conversation_that_is_not_the_callers_own(self):
        mock_supabase, _, _ = _build_mock_supabase(
            {"make": "Honda"}, conversation_lookup_data=None
        )
        with patch("app.routers.ai_advisor.supabase", mock_supabase):
            response = client.post(
                "/ai-advisor/classify",
                json={
                    "car_id": "car-1",
                    "description": "Engine noise",
                    "conversation_id": "someone-elses-conversation",
                },
            )

        assert response.status_code == 404

    def test_returns_404_for_a_car_that_is_not_the_callers_own(self):
        mock_supabase, _, _ = _build_mock_supabase(None)
        with patch("app.routers.ai_advisor.supabase", mock_supabase):
            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "someone-elses-car", "description": "Engine noise"},
            )

        assert response.status_code == 404

    def test_saves_the_user_message_even_when_the_llm_service_fails(self):
        mock_supabase, captured, _ = _build_mock_supabase({"make": "Toyota"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify:
            mock_classify.side_effect = LLMError(
                "Could not get advice right now. Please try again."
            )

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Engine noise"},
            )

        assert response.status_code == 503
        assert response.json() == {
            "detail": "Could not get advice right now. Please try again."
        }
        # The user's message was saved even though no AI reply followed.
        assert len(captured) == 1
        assert captured[0]["sender"] == "user"

    def test_rejects_an_empty_description(self):
        response = client.post(
            "/ai-advisor/classify",
            json={"car_id": "car-1", "description": ""},
        )

        assert response.status_code == 422


class TestDescriptionValidation:
    """CAR-22: invalid input is rejected up front with a clear message —
    blank / symbol-only text, and text over the length cap — before any
    database, NHTSA or LLM work happens. Gibberish made of letters can't be
    told apart from real text by rules, so it still goes to the LLM (which
    is prompted to ask for detail / prefer a mechanic)."""

    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def _post(self, description):
        mock_supabase, captured, _ = _build_mock_supabase({"make": "Toyota", "model": "Camry", "year": 2016})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify, patch("app.routers.ai_advisor.search_diy_video", return_value=None):
            mock_classify.return_value = {"recommendation": "mechanic", "guidance": "See a mechanic."}
            response = client.post(
                "/ai-advisor/classify", json={"car_id": "car-1", "description": description}
            )
        return response, mock_supabase, captured, mock_classify

    @pytest.mark.parametrize("description", ["   ", "\n\t  ", "!!!??? ###", "12345 67890", "🚗🚗🚗", "a b"])
    def test_rejects_blank_or_symbol_only_text_with_a_clear_message(self, description):
        response, mock_supabase, captured, mock_classify = self._post(description)

        assert response.status_code == 422
        assert response.json() == {"detail": "Please describe the problem in a few words."}
        # Nothing was touched: no DB access, no saved message, no LLM call.
        mock_supabase.table.assert_not_called()
        assert captured == []
        mock_classify.assert_not_called()

    def test_rejects_text_over_the_length_cap_without_touching_anything(self):
        response, mock_supabase, captured, mock_classify = self._post("engine noise " * 200)

        assert response.status_code == 422
        assert response.json() == {"detail": "Please keep your description under 1000 characters."}
        mock_supabase.table.assert_not_called()
        assert captured == []
        mock_classify.assert_not_called()

    def test_accepts_text_exactly_at_the_length_cap(self):
        text = ("brake noise " * 100)[:1000]
        assert len(text) == 1000

        response, _, captured, mock_classify = self._post(text)

        assert response.status_code == 200
        mock_classify.assert_called_once()
        assert captured[0]["message_text"] == text

    def test_saves_and_forwards_the_trimmed_description(self):
        response, _, captured, mock_classify = self._post("   squeaking brakes   ")

        assert response.status_code == 200
        assert captured[0]["message_text"] == "squeaking brakes"
        assert mock_classify.call_args.args[0] == "squeaking brakes"

    def test_accepts_non_english_text(self):
        response, _, _, mock_classify = self._post("صوت غريب من الفرامل")

        assert response.status_code == 200
        mock_classify.assert_called_once()

    def test_gibberish_made_of_letters_still_goes_to_the_llm(self):
        response, _, _, mock_classify = self._post("asdkjh qwpoei zxcmnb lkjhgf")

        assert response.status_code == 200
        mock_classify.assert_called_once()


class TestYouTubeVideoWiring:
    """CAR-40: a matching video is saved onto the AI message row and
    returned, a diy recommendation with no match returns no video
    fields, and a mechanic recommendation never triggers the lookup."""

    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def test_saves_and_returns_a_video_when_diy_and_a_match_is_found(self):
        mock_supabase, _, updates = _build_mock_supabase({"make": "Honda"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify, patch(
            "app.routers.ai_advisor.search_diy_video"
        ) as mock_search:
            mock_classify.return_value = {
                "recommendation": "diy",
                "guidance": "Top up the washer fluid.",
            }
            mock_search.return_value = {
                "video_title": "How to Top Up Washer Fluid",
                "video_url": "https://www.youtube.com/watch?v=abc123",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Washer fluid light is on"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["video_title"] == "How to Top Up Washer Fluid"
        assert body["video_url"] == "https://www.youtube.com/watch?v=abc123"
        mock_search.assert_called_once_with(
            {"make": "Honda"}, "Washer fluid light is on"
        )
        # The video was saved onto the AI message row (the 2nd insert).
        assert len(updates) == 1
        assert updates[0] == {
            "id": "msg-2",
            "video_title": "How to Top Up Washer Fluid",
            "video_url": "https://www.youtube.com/watch?v=abc123",
        }

    def test_returns_no_video_fields_when_diy_and_no_match_is_found(self):
        mock_supabase, _, updates = _build_mock_supabase({"make": "Honda"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify, patch(
            "app.routers.ai_advisor.search_diy_video", return_value=None
        ):
            mock_classify.return_value = {
                "recommendation": "diy",
                "guidance": "Top up the washer fluid.",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Washer fluid light is on"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["video_title"] is None
        assert body["video_url"] is None
        assert updates == []

    def test_does_not_look_up_a_video_for_a_mechanic_recommendation(self):
        mock_supabase, _, updates = _build_mock_supabase({"make": "Honda"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify, patch(
            "app.routers.ai_advisor.search_diy_video"
        ) as mock_search:
            mock_classify.return_value = {
                "recommendation": "mechanic",
                "guidance": "See a mechanic.",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Brakes are grinding"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["video_title"] is None
        assert body["video_url"] is None
        mock_search.assert_not_called()
        assert updates == []


class TestYouTubeFailureNeverBreaksTheAnswer:
    """CAR-22: a DIY answer is already saved before the video step, so no
    failure while finding or saving a video may turn it into an error."""

    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def _post_diy(self, mock_supabase, **patches):
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue",
            return_value={"recommendation": "diy", "guidance": "Top up the washer fluid."},
        ), patch("app.routers.ai_advisor.search_diy_video", **patches):
            return client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Washer fluid light is on"},
            )

    def test_an_unexpected_error_in_the_video_lookup_still_returns_the_answer(self):
        mock_supabase, _, updates = _build_mock_supabase({"make": "Honda"})

        response = self._post_diy(mock_supabase, side_effect=RuntimeError("boom"))

        assert response.status_code == 200
        body = response.json()
        assert body["recommendation"] == "diy"
        assert body["guidance"] == "Top up the washer fluid."
        assert body["video_title"] is None and body["video_url"] is None
        assert updates == []

    def test_failing_to_save_the_video_still_returns_the_answer_and_the_video(self):
        mock_supabase, _, _ = _build_mock_supabase({"make": "Honda"})
        video = {"video_title": "Top Up Washer Fluid", "video_url": "https://www.youtube.com/watch?v=abc"}
        # Make only the message UPDATE (saving the video) blow up.
        original_table = mock_supabase.table.side_effect

        def table(name):
            t = original_table(name)
            if name == "advisor_messages":
                t.update.side_effect = RuntimeError("db hiccup")
            return t

        mock_supabase.table.side_effect = table

        response = self._post_diy(mock_supabase, return_value=video)

        assert response.status_code == 200
        assert response.json()["guidance"] == "Top up the washer fluid."
        assert response.json()["video_url"] == video["video_url"]


class TestNHTSASafetyWiring:
    """CAR-36: a matching recall/complaint pattern skips the LLM and
    forces 'mechanic' with an NHTSA-grounded explanation, a vehicle
    NHTSA doesn't recognize gets a disclaimer appended to the normal LLM
    guidance, and an unreachable NHTSA API falls back to the normal LLM
    path unchanged."""

    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def test_a_recall_match_forces_mechanic_and_skips_the_llm(self):
        mock_supabase, _, _ = _build_mock_supabase({"make": "Honda", "model": "Civic"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.check_safety_data",
            return_value={
                "status": "recall_match",
                "summary": "Steering may fail unexpectedly.",
            },
        ), patch("app.routers.ai_advisor.classify_issue") as mock_classify:
            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Steering locks up"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["recommendation"] == "mechanic"
        assert "open recall" in body["guidance"]
        assert "Steering may fail unexpectedly." in body["guidance"]
        # The LLM is never called — the recall is authoritative on its own.
        mock_classify.assert_not_called()

    def test_a_recall_match_names_the_system_without_claiming_an_exact_match(self):
        mock_supabase, _, _ = _build_mock_supabase({"make": "Ford", "model": "F-150"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.check_safety_data",
            return_value={
                "status": "recall_match",
                "summary": "Brake fluid may leak.",
                "system": "brakes",
            },
        ), patch("app.routers.ai_advisor.classify_issue"):
            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Brakes squeak a little"},
            )

        guidance = response.json()["guidance"]
        assert "same system as this issue (brakes)" in guidance
        assert "exact issue" not in guidance

    def test_a_complaint_pattern_forces_mechanic_and_skips_the_llm(self):
        mock_supabase, _, _ = _build_mock_supabase({"make": "Honda", "model": "Civic"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.check_safety_data",
            return_value={"status": "complaint_pattern", "count": 7, "summary": "..."},
        ), patch("app.routers.ai_advisor.classify_issue") as mock_classify:
            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Brakes are grinding"},
            )

        assert response.status_code == 200
        body = response.json()
        assert body["recommendation"] == "mechanic"
        assert "7 similar owner complaints" in body["guidance"]
        mock_classify.assert_not_called()

    def test_not_found_still_calls_the_llm_with_a_disclaimer_appended(self):
        mock_supabase, _, _ = _build_mock_supabase({"make": "Mercedes-Benz", "model": "C230"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.check_safety_data",
            return_value={"status": "not_found"},
        ), patch("app.routers.ai_advisor.classify_issue") as mock_classify, patch(
            "app.routers.ai_advisor.search_diy_video", return_value=None
        ):
            mock_classify.return_value = {
                "recommendation": "diy",
                "guidance": "Top up the washer fluid.",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Washer fluid light is on"},
            )

        assert response.status_code == 200
        body = response.json()
        # The LLM's own recommendation still stands — only a note is added.
        assert body["recommendation"] == "diy"
        assert body["guidance"].startswith("Top up the washer fluid.")
        assert "NHTSA safety data isn't available" in body["guidance"]
        mock_classify.assert_called_once()

    def test_an_unavailable_nhtsa_api_falls_back_to_the_llm_unchanged(self):
        mock_supabase, _, _ = _build_mock_supabase({"make": "Honda", "model": "Civic"})
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.check_safety_data",
            return_value={"status": "unavailable"},
        ), patch("app.routers.ai_advisor.classify_issue") as mock_classify:
            mock_classify.return_value = {
                "recommendation": "mechanic",
                "guidance": "See a mechanic.",
            }

            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "car-1", "description": "Engine noise"},
            )

        assert response.status_code == 200
        assert response.json() == {
            "conversation_id": "conv-1",
            "recommendation": "mechanic",
            "guidance": "See a mechanic.",
            "video_title": None,
            "video_url": None,
        }
        mock_classify.assert_called_once()


def test_classify_requires_authentication():
    # No dependency override here — hits the real get_current_user_id,
    # which requires a valid Authorization header.
    response = client.post(
        "/ai-advisor/classify",
        json={"car_id": "car-1", "description": "Engine noise"},
    )

    assert response.status_code == 401
