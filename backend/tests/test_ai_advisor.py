# Tests POST /ai-advisor/classify: the normal flow (car ownership check +
# LLM classification), a car that isn't the caller's own, an LLM
# service failure surfacing as a clear 503, missing/empty description
# validation, and missing authentication.

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import app
from app.services.llm_client import LLMError

client = TestClient(app)


def _mock_supabase_for_classify(car_data):
    """Mocks supabase.table("cars")...maybe_single() to return `car_data`,
    matching supabase-py's real behavior where maybe_single().execute()
    returns None outright (not a response object with .data=None) when
    nothing matches."""
    mock_supabase = MagicMock()
    cars_table = MagicMock()
    cars_table.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        MagicMock(data=car_data) if car_data is not None else None
    )
    mock_supabase.table.return_value = cars_table
    return mock_supabase


class TestPostClassify:
    def setup_method(self):
        app.dependency_overrides[get_current_user_id] = lambda: "user-123"

    def teardown_method(self):
        app.dependency_overrides.pop(get_current_user_id, None)

    def test_returns_the_classification_for_the_callers_own_car(self):
        mock_supabase = _mock_supabase_for_classify(
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
            "recommendation": "diy",
            "guidance": "Top up the washer fluid.",
        }
        mock_classify.assert_called_once_with(
            "Washer fluid light is on",
            {"make": "Toyota", "model": "Corolla", "year": 2020},
        )

    def test_returns_404_for_a_car_that_is_not_the_callers_own(self):
        mock_supabase = _mock_supabase_for_classify(None)
        with patch("app.routers.ai_advisor.supabase", mock_supabase):
            response = client.post(
                "/ai-advisor/classify",
                json={"car_id": "someone-elses-car", "description": "Engine noise"},
            )

        assert response.status_code == 404

    def test_returns_a_clear_503_when_the_llm_service_fails(self):
        mock_supabase = _mock_supabase_for_classify({"make": "Toyota"})
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
