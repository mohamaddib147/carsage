# Tests the AI Advisor LLM classification: a normal Gemini response, the
# Groq fallback on ANY Gemini failure (429 rate limit, 5xx "high demand",
# and — CAR-22 — 400/401/403/404 config failures such as a retired model or
# disabled key, plus a 200 with an unusable body), the user never seeing a
# raw provider error or exception when both providers fail (including a
# malformed Groq body), and response parsing (valid JSON, a markdown-fenced reply, and malformed/ambiguous
# replies all defaulting to the cautious "mechanic" recommendation). All
# outbound httpx calls are mocked so these never hit the real APIs.

import base64
import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.llm_client import (
    DEFAULT_RESULT,
    LLMError,
    _parse_response,
    classify_issue,
)


def _mock_response(status_code=200, json_body=None):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = json_body or {}
    response.raise_for_status.side_effect = (
        None
        if status_code < 400
        else httpx.HTTPStatusError("error", request=MagicMock(), response=response)
    )
    return response


def _gemini_payload(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def _groq_payload(text):
    return {"choices": [{"message": {"content": text}}]}


def test_classify_issue_returns_gemini_result_on_the_normal_path():
    reply = json.dumps({"recommendation": "diy", "guidance": "Check the washer fluid."})
    with patch(
        "app.services.llm_client.httpx.post",
        return_value=_mock_response(json_body=_gemini_payload(reply)),
    ) as mock_post:
        result = classify_issue("Washer fluid light is on", {"make": "Toyota"})

    assert result == {"recommendation": "diy", "guidance": "Check the washer fluid."}
    mock_post.assert_called_once()


def test_classify_issue_falls_back_to_groq_on_a_gemini_429(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    groq_reply = json.dumps({"recommendation": "mechanic", "guidance": "See a mechanic."})

    gemini_response = _mock_response(status_code=429)
    groq_response = _mock_response(json_body=_groq_payload(groq_reply))

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[gemini_response, groq_response],
    ) as mock_post:
        result = classify_issue("Brakes squeal", {"make": "Honda"})

    assert result == {"recommendation": "mechanic", "guidance": "See a mechanic."}
    assert mock_post.call_count == 2


def test_classify_issue_falls_back_to_groq_on_a_gemini_503(monkeypatch):
    # Real-world case: Gemini's free tier frequently returns "503
    # currently experiencing high demand" — treated the same as a rate
    # limit since the right response is the same (try the other provider).
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    groq_reply = json.dumps({"recommendation": "diy", "guidance": "Top it up."})

    gemini_response = _mock_response(status_code=503)
    groq_response = _mock_response(json_body=_groq_payload(groq_reply))

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[gemini_response, groq_response],
    ) as mock_post:
        result = classify_issue("Washer fluid light is on", {"make": "Toyota"})

    assert result == {"recommendation": "diy", "guidance": "Top it up."}
    assert mock_post.call_count == 2


def test_classify_issue_raises_when_rate_limited_and_no_groq_key_configured(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "")

    with patch(
        "app.services.llm_client.httpx.post",
        return_value=_mock_response(status_code=429),
    ):
        with pytest.raises(LLMError):
            classify_issue("Brakes squeal", {"make": "Honda"})


def test_classify_issue_raises_when_both_providers_fail(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[_mock_response(status_code=429), _mock_response(status_code=500)],
    ):
        with pytest.raises(LLMError):
            classify_issue("Brakes squeal", {"make": "Honda"})


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_classify_issue_falls_back_to_groq_on_a_gemini_config_failure(monkeypatch, status):
    # CAR-22: a retired model (404) or a disabled/invalid key (400/401/403)
    # is a Gemini-side problem — Groq is a separate provider, so the user
    # still gets an answer instead of an error.
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    groq_reply = json.dumps({"recommendation": "mechanic", "guidance": "See a mechanic."})

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[
            _mock_response(status_code=status),
            _mock_response(json_body=_groq_payload(groq_reply)),
        ],
    ) as mock_post:
        result = classify_issue("Engine won't start", {"make": "Ford"})

    assert result == {"recommendation": "mechanic", "guidance": "See a mechanic."}
    assert mock_post.call_count == 2


def test_a_gemini_config_failure_with_no_groq_key_gives_a_clean_error_not_a_provider_error(
    monkeypatch,
):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "")

    with patch(
        "app.services.llm_client.httpx.post", return_value=_mock_response(status_code=404)
    ):
        with pytest.raises(LLMError) as excinfo:
            classify_issue("Engine won't start", {"make": "Ford"})

    assert str(excinfo.value) == "Could not get advice right now. Please try again."


@pytest.mark.parametrize(
    "body",
    [
        {"promptFeedback": {"blockReason": "SAFETY"}},  # content blocked: no candidates key
        {"candidates": []},
        {"candidates": [{"finishReason": "SAFETY", "content": {}}]},  # no parts
        {"candidates": [{"content": {"parts": []}}]},
        {"candidates": None},
    ],
)
def test_classify_issue_falls_back_to_groq_when_gemini_returns_an_unusable_200(
    monkeypatch, body
):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    groq_reply = json.dumps({"recommendation": "diy", "guidance": "Top it up."})

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[
            _mock_response(json_body=body),
            _mock_response(json_body=_groq_payload(groq_reply)),
        ],
    ):
        result = classify_issue("Washer fluid low", {"make": "Toyota"})

    assert result == {"recommendation": "diy", "guidance": "Top it up."}


def test_classify_issue_falls_back_to_groq_when_gemini_returns_non_json(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    non_json = _mock_response()
    non_json.json.side_effect = ValueError("not json")
    groq_reply = json.dumps({"recommendation": "mechanic", "guidance": "See a mechanic."})

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[non_json, _mock_response(json_body=_groq_payload(groq_reply))],
    ):
        result = classify_issue("Brakes squeal", {"make": "Honda"})

    assert result["recommendation"] == "mechanic"


@pytest.mark.parametrize("groq_body", [{"choices": []}, {}, {"choices": [{"message": {}}]}, {"choices": None}])
def test_a_malformed_groq_body_gives_a_clean_llm_error_not_a_crash(monkeypatch, groq_body):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[_mock_response(status_code=429), _mock_response(json_body=groq_body)],
    ):
        with pytest.raises(LLMError) as excinfo:
            classify_issue("Brakes squeal", {"make": "Honda"})

    assert str(excinfo.value) == "Could not get advice right now. Please try again."


def test_a_non_json_groq_body_gives_a_clean_llm_error_not_a_crash(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    non_json = _mock_response()
    non_json.json.side_effect = ValueError("not json")

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=[_mock_response(status_code=429), non_json],
    ):
        with pytest.raises(LLMError):
            classify_issue("Brakes squeal", {"make": "Honda"})


def test_provider_errors_and_hostnames_never_reach_the_user_message(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")

    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=httpx.ConnectError("connection refused to internal-host:9999 key=SECRET"),
    ):
        with pytest.raises(LLMError) as excinfo:
            classify_issue("Brakes squeal", {"make": "Honda"})

    assert "internal-host" not in str(excinfo.value)
    assert "SECRET" not in str(excinfo.value)


def test_parse_response_accepts_valid_json():
    text = json.dumps({"recommendation": "diy", "guidance": "It's fine."})
    assert _parse_response(text) == {"recommendation": "diy", "guidance": "It's fine."}


def test_parse_response_strips_markdown_code_fences():
    text = '```json\n{"recommendation": "mechanic", "guidance": "Go see one."}\n```'
    assert _parse_response(text) == {
        "recommendation": "mechanic",
        "guidance": "Go see one.",
    }


def test_parse_response_defaults_to_mechanic_on_malformed_json():
    assert _parse_response("not json at all") == DEFAULT_RESULT


def test_parse_response_defaults_to_mechanic_on_an_invalid_recommendation_value():
    text = json.dumps({"recommendation": "probably-fine", "guidance": "Eh, whatever."})
    assert _parse_response(text) == DEFAULT_RESULT


def test_parse_response_defaults_to_mechanic_on_empty_guidance():
    text = json.dumps({"recommendation": "diy", "guidance": "   "})
    assert _parse_response(text) == DEFAULT_RESULT


def test_parse_response_defaults_to_mechanic_on_empty_text():
    assert _parse_response("") == DEFAULT_RESULT


# --- CAR-44/49: estimate_tank_capacity (Car Onboarding autofill) ----------


def _gemini_reply(text):
    response = MagicMock()
    response.status_code = 200
    response.raise_for_status.return_value = None
    response.json.return_value = {"candidates": [{"content": {"parts": [{"text": text}]}}]}
    return response


@pytest.mark.parametrize(
    "reply, expected",
    [
        ('{"tank_liters": 64.3}', 64.3),
        ('{"tank_liters": 50}', 50.0),
        ('```json\n{"tank_liters": 46.64}\n```', 46.6),
        ('Sure! {"tank_liters": 43}', 43.0),
        ('{"tank_liters": null}', None),
        ('{"tank_liters": 430}', None),
        ('{"tank_liters": 3}', None),
        ('{"tank_liters": "sixty"}', None),
        ('{"tank_liters": true}', None),
        ("I do not know", None),
        ("", None),
    ],
)
def test_estimate_tank_capacity_parses_and_range_checks_the_reply(reply, expected):
    from app.services.llm_client import estimate_tank_capacity

    with patch("app.services.llm_client.httpx.post", return_value=_gemini_reply(reply)):
        assert estimate_tank_capacity("Toyota", "Camry", 2016) == expected


def test_estimate_tank_capacity_asks_about_the_right_vehicle():
    from app.services.llm_client import estimate_tank_capacity

    with patch(
        "app.services.llm_client.httpx.post", return_value=_gemini_reply('{"tank_liters": 64}')
    ) as mock_post:
        estimate_tank_capacity("Toyota", "Camry", 2016)

    sent = mock_post.call_args.kwargs["json"]
    assert sent["contents"][0]["parts"][0]["text"] == "Vehicle: 2016 Toyota Camry"


def test_estimate_tank_capacity_falls_back_to_groq_when_gemini_is_rate_limited(monkeypatch):
    from app.services.llm_client import estimate_tank_capacity

    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    gemini_429 = MagicMock(status_code=429)
    groq_ok = MagicMock(status_code=200)
    groq_ok.raise_for_status.return_value = None
    groq_ok.json.return_value = {"choices": [{"message": {"content": '{"tank_liters": 50}'}}]}

    with patch("app.services.llm_client.httpx.post", side_effect=[gemini_429, groq_ok]):
        assert estimate_tank_capacity("Toyota", "Corolla", 2015) == 50.0


def test_estimate_tank_capacity_returns_none_and_never_raises_when_the_llm_is_down(
    monkeypatch,
):
    from app.services.llm_client import estimate_tank_capacity

    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "")
    with patch("app.services.llm_client.httpx.post", side_effect=httpx.ConnectError("down")):
        assert estimate_tank_capacity("Toyota", "Camry", 2016) is None

    # A non-retryable provider failure (e.g. a 401) must not raise either.
    bad = MagicMock(status_code=401)
    bad.raise_for_status.side_effect = httpx.HTTPStatusError(
        "401", request=MagicMock(), response=bad
    )
    with patch("app.services.llm_client.httpx.post", return_value=bad):
        assert estimate_tank_capacity("Toyota", "Camry", 2016) is None

    # A malformed provider reply (no candidates) must not raise either.
    odd = MagicMock(status_code=200)
    odd.raise_for_status.return_value = None
    odd.json.return_value = {}
    with patch("app.services.llm_client.httpx.post", return_value=odd):
        assert estimate_tank_capacity("Toyota", "Camry", 2016) is None


# --- Step 2: extract_pump_fields / extract_odometer_fields (fuel-log camera) -

from app.services.llm_client import (  # noqa: E402
    CAMERA_SCAN_FAILURE_MESSAGE,
    _parse_odometer_fields,
    _parse_pump_fields,
    extract_odometer_fields,
    extract_pump_fields,
)


def test_extract_pump_fields_returns_gemini_result_on_the_normal_path():
    reply = json.dumps({"readable": True, "liters": 19.6, "total_price": 2_940_000, "currency": "LBP"})
    with patch("app.services.llm_client.httpx.post", return_value=_gemini_reply(reply)) as mock_post:
        result = extract_pump_fields(b"fake-image-bytes", "image/jpeg")

    assert result == {"readable": True, "liters": 19.6, "total_price": 2_940_000.0, "currency": "LBP"}
    sent = mock_post.call_args.kwargs["json"]
    image_part = next(part for part in sent["contents"][0]["parts"] if "inline_data" in part)
    assert base64.b64decode(image_part["inline_data"]["data"]) == b"fake-image-bytes"


def test_extract_pump_fields_never_falls_back_to_groq(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    with patch(
        "app.services.llm_client.httpx.post", return_value=MagicMock(status_code=429)
    ) as mock_post:
        with pytest.raises(LLMError) as excinfo:
            extract_pump_fields(b"fake-image-bytes", "image/jpeg")

    mock_post.assert_called_once()
    assert str(excinfo.value) == CAMERA_SCAN_FAILURE_MESSAGE


def test_a_vision_transport_failure_never_leaks_hostnames_or_secrets():
    with patch(
        "app.services.llm_client.httpx.post",
        side_effect=httpx.ConnectError("connection refused to internal-host:9999 key=SECRET"),
    ):
        with pytest.raises(LLMError) as excinfo:
            extract_pump_fields(b"fake-image-bytes", "image/jpeg")

    assert str(excinfo.value) == CAMERA_SCAN_FAILURE_MESSAGE
    assert "internal-host" not in str(excinfo.value)
    assert "SECRET" not in str(excinfo.value)


def test_a_vision_call_raises_cleanly_on_an_unusable_gemini_200():
    odd = MagicMock(status_code=200)
    odd.json.return_value = {"candidates": []}
    with patch("app.services.llm_client.httpx.post", return_value=odd):
        with pytest.raises(LLMError) as excinfo:
            extract_odometer_fields(b"fake-image-bytes", "image/jpeg")

    assert str(excinfo.value) == CAMERA_SCAN_FAILURE_MESSAGE


def test_parse_pump_fields_reports_unreadable_when_the_model_says_so():
    reply = json.dumps({"readable": False, "liters": None, "total_price": None, "currency": None})
    assert _parse_pump_fields(reply) == {
        "readable": False, "liters": None, "total_price": None, "currency": None,
    }


@pytest.mark.parametrize("text", ["", "not json", "{broken", "null", "[]", '{"readable": false}'])
def test_parse_pump_fields_defaults_to_unreadable_on_malformed_replies(text):
    result = _parse_pump_fields(text)
    assert result["readable"] is False


@pytest.mark.parametrize(
    "liters, expected",
    [(19.6, 19.6), (0, None), (-5, None), (501, None), (True, None), ("19.6", None)],
)
def test_parse_pump_fields_range_checks_liters(liters, expected):
    reply = json.dumps({"readable": True, "liters": liters, "total_price": 30, "currency": "USD"})
    assert _parse_pump_fields(reply)["liters"] == expected


@pytest.mark.parametrize("currency, expected", [("LBP", "LBP"), ("USD", "USD"), ("EUR", None), (None, None), (5, None)])
def test_parse_pump_fields_only_accepts_lbp_or_usd_currency(currency, expected):
    reply = json.dumps({"readable": True, "liters": 20, "total_price": 30, "currency": currency})
    assert _parse_pump_fields(reply)["currency"] == expected


def test_extract_odometer_fields_returns_gemini_result_on_the_normal_path():
    reply = json.dumps({"readable": True, "odometer_km": 84610})
    with patch("app.services.llm_client.httpx.post", return_value=_gemini_reply(reply)):
        result = extract_odometer_fields(b"fake-image-bytes", "image/jpeg")

    assert result == {"readable": True, "odometer_km": 84610}


def test_extract_odometer_fields_never_falls_back_to_groq(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GROQ_API_KEY", "test-groq-key")
    with patch(
        "app.services.llm_client.httpx.post", return_value=MagicMock(status_code=429)
    ) as mock_post:
        with pytest.raises(LLMError) as excinfo:
            extract_odometer_fields(b"fake-image-bytes", "image/jpeg")

    mock_post.assert_called_once()
    assert str(excinfo.value) == CAMERA_SCAN_FAILURE_MESSAGE


def test_parse_odometer_fields_reports_unreadable_when_the_model_says_so():
    reply = json.dumps({"readable": False, "odometer_km": None})
    assert _parse_odometer_fields(reply) == {"readable": False, "odometer_km": None}


@pytest.mark.parametrize(
    "value, expected",
    [(84610, 84610), (0, None), (-5, None), (2_000_001, None), (2_000_000, 2_000_000), (True, None), ("84610", None)],
)
def test_parse_odometer_fields_range_checks_the_reading(value, expected):
    reply = json.dumps({"readable": True, "odometer_km": value})
    assert _parse_odometer_fields(reply)["odometer_km"] == expected


@pytest.mark.parametrize("text", ["", "not json", "{broken", "null", "[]", '{"readable": false}'])
def test_parse_odometer_fields_defaults_to_unreadable_on_malformed_replies(text):
    assert _parse_odometer_fields(text)["readable"] is False


def test_pump_and_odometer_scans_use_the_vision_key_when_configured(monkeypatch):
    monkeypatch.setattr("app.services.llm_client.GEMINI_VISION_API_KEY", "vision-only-key")
    reply = json.dumps({"readable": True, "liters": 20, "total_price": 30, "currency": "USD"})
    with patch("app.services.llm_client.httpx.post", return_value=_gemini_reply(reply)) as mock_post:
        extract_pump_fields(b"fake-image-bytes", "image/jpeg")

    assert mock_post.call_args.kwargs["params"]["key"] == "vision-only-key"


# --- Advisor camera: text that came from a photo guess ---------------------------

from app.services.llm_client import PHOTO_CAUTION, SYSTEM_PROMPT  # noqa: E402


def test_classify_issue_adds_the_photo_caution_only_when_the_text_came_from_a_photo():
    reply = json.dumps({"recommendation": "mechanic", "guidance": "See a mechanic."})
    with patch("app.services.llm_client.httpx.post", return_value=_mock_response(json_body=_gemini_payload(reply))) as plain:
        classify_issue("A headlight is not working.", {"make": "Toyota"})
    with patch("app.services.llm_client.httpx.post", return_value=_mock_response(json_body=_gemini_payload(reply))) as photo:
        classify_issue("A headlight is not working.", {"make": "Toyota"}, from_photo=True)

    assert plain.call_args.kwargs["json"]["systemInstruction"]["parts"][0]["text"] == SYSTEM_PROMPT
    sent = photo.call_args.kwargs["json"]["systemInstruction"]["parts"][0]["text"]
    assert sent == SYSTEM_PROMPT + PHOTO_CAUTION
    assert "automated guess about a photo" in sent and "recommend a mechanic" in sent
