# Tests the YouTube DIY video lookup: the normal case (finds the top
# result), no results, no configured key, and a simulated API failure
# (network error or a quota-exceeded-style HTTP error) all falling back
# to None cleanly. All outbound httpx calls are mocked so these never
# hit the real API.

from unittest.mock import MagicMock, patch

import httpx

from app.services.youtube_client import _build_query, search_diy_video


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


SEARCH_RESULT = {
    "items": [
        {
            "id": {"videoId": "abc123"},
            "snippet": {"title": "How to Fix Squeaking Brakes"},
        }
    ]
}


def test_build_query_combines_car_context_and_the_issue_description():
    query = _build_query(
        {"year": 2005, "make": "Mercedes-Benz", "model": "C230"},
        "Squeaking brakes when cold",
    )
    assert query == "2005 Mercedes-Benz C230 Squeaking brakes when cold fix"


def test_build_query_truncates_a_very_long_description():
    query = _build_query({"make": "Honda"}, "x" * 500)
    # "Honda " (6 chars) + 100-char truncated description + " fix" (4 chars)
    assert len(query) == 6 + 100 + 4


def test_search_diy_video_returns_the_top_result_on_the_normal_path(monkeypatch):
    monkeypatch.setattr("app.services.youtube_client.YOUTUBE_API_KEY", "test-key")

    with patch(
        "app.services.youtube_client.httpx.get",
        return_value=_mock_response(SEARCH_RESULT),
    ) as mock_get:
        result = search_diy_video({"make": "Honda", "model": "Civic"}, "Squeaking brakes")

    assert result == {
        "video_title": "How to Fix Squeaking Brakes",
        "video_url": "https://www.youtube.com/watch?v=abc123",
    }
    mock_get.assert_called_once()


def test_search_diy_video_returns_none_with_no_results(monkeypatch):
    monkeypatch.setattr("app.services.youtube_client.YOUTUBE_API_KEY", "test-key")

    with patch(
        "app.services.youtube_client.httpx.get",
        return_value=_mock_response({"items": []}),
    ):
        result = search_diy_video({"make": "Honda"}, "A very obscure issue")

    assert result is None


def test_search_diy_video_returns_none_without_a_configured_key(monkeypatch):
    monkeypatch.setattr("app.services.youtube_client.YOUTUBE_API_KEY", "")

    with patch("app.services.youtube_client.httpx.get") as mock_get:
        result = search_diy_video({"make": "Honda"}, "Squeaking brakes")

    assert result is None
    mock_get.assert_not_called()


def test_search_diy_video_returns_none_on_a_quota_exceeded_style_failure(monkeypatch):
    monkeypatch.setattr("app.services.youtube_client.YOUTUBE_API_KEY", "test-key")

    with patch(
        "app.services.youtube_client.httpx.get",
        return_value=_mock_response({"error": "quota exceeded"}, status_code=403),
    ):
        result = search_diy_video({"make": "Honda"}, "Squeaking brakes")

    assert result is None


def test_search_diy_video_returns_none_on_a_network_failure(monkeypatch):
    monkeypatch.setattr("app.services.youtube_client.YOUTUBE_API_KEY", "test-key")

    with patch(
        "app.services.youtube_client.httpx.get",
        side_effect=httpx.ConnectError("boom"),
    ):
        result = search_diy_video({"make": "Honda"}, "Squeaking brakes")

    assert result is None
