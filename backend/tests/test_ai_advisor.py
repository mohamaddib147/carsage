# Tests POST /ai-advisor/classify: the normal flow (car ownership check,
# a new conversation + both messages persisted, LLM classification),
# appending to an existing conversation, a conversation that isn't the
# caller's own, a car that isn't the caller's own, the user's message
# still being saved when the LLM service fails (surfacing a clear 503),
# missing/empty description validation, and missing authentication.

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.services.llm_client import LLMError

client = TestClient(app)


def _build_mock_supabase(
    car_data, conversation_lookup_data=None, new_conversation_id="conv-1"
):
    """
    Mocks supabase.table(...) for "cars" (ownership check),
    "advisor_conversations" (lookup-by-id for an existing conversation,
    or insert for a new one), and "advisor_messages" (insert, capturing
    every inserted row). Matches supabase-py's real behavior where
    maybe_single().execute() returns None outright (not a response
    object with .data=None) when nothing matches.

    Returns (mock_supabase, captured_messages).
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
    captured_messages = []

    def insert_message(row):
        captured_messages.append(row)
        result = MagicMock()
        result.execute.return_value = MagicMock(data=[{"id": "msg-1", **row}])
        return result

    messages_table.insert.side_effect = insert_message

    mock_supabase.table.side_effect = lambda name: {
        "cars": cars_table,
        "advisor_conversations": conversations_table,
        "advisor_messages": messages_table,
    }[name]

    return mock_supabase, captured_messages


class TestPostClassify:
    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def test_returns_the_classification_and_persists_both_messages_in_a_new_conversation(
        self,
    ):
        mock_supabase, captured = _build_mock_supabase(
            {"make": "Toyota", "model": "Corolla", "year": 2020}
        )
        with patch("app.routers.ai_advisor.supabase", mock_supabase), patch(
            "app.routers.ai_advisor.classify_issue"
        ) as mock_classify:
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
        mock_supabase, captured = _build_mock_supabase(
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
        mock_supabase, _ = _build_mock_supabase(
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
        mock_supabase, _ = _build_mock_supabase(None)
        with patch("app.routers.ai_advisor.supabase", mock_supabase):
            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "someone-elses-car", "description": "Engine noise"},
            )

        assert response.status_code == 404

    def test_saves_the_user_message_even_when_the_llm_service_fails(self):
        mock_supabase, captured = _build_mock_supabase({"make": "Toyota"})
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


def test_classify_requires_authentication():
    # No dependency override here — hits the real get_current_user_id,
    # which requires a valid Authorization header.
    response = client.post(
        "/ai-advisor/classify",
        json={"car_id": "car-1", "description": "Engine noise"},
    )

    assert response.status_code == 401
