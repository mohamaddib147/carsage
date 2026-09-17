# Isolates all AI Advisor LLM calls behind one function (classify_issue),
# so the rest of the app never talks to a provider directly and the
# provider could be swapped without touching the router. Gemini is the
# primary provider; Groq is an automatic fallback used only when Gemini
# returns a 429 (rate limit). Both providers are prompted for the exact
# same JSON shape so the caller never has to know which one answered.

import json
import logging

import httpx

from app.config import GEMINI_API_KEY, GROQ_API_KEY

logger = logging.getLogger(__name__)

# gemini-2.0-flash (the model named in CLAUDE.md's original spec) has
# been retired by Google and now returns 404 — gemini-3.6-flash is the
# current equivalent free-tier flash model, confirmed live 2026-09-17.
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-3.6-flash:generateContent"
)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# llama-3.3-70b-versatile (CLAUDE.md's original example model) has been
# retired from Groq's catalog and now returns 404 model_not_found —
# openai/gpt-oss-120b is a current free-tier equivalent, confirmed live
# 2026-09-17 (see GEMINI_URL's model note for the same situation on
# Gemini's side).
GROQ_MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = (
    "You are a car repair triage assistant. A vehicle owner will describe "
    "a problem with their car. Decide whether it is safe for an average "
    "owner to diagnose or fix it themselves (DIY) or whether they should "
    "see a professional mechanic.\n\n"
    "Only classify something as DIY if it is genuinely low-risk and "
    "commonly self-serviceable (e.g. a loose gas cap warning light, low "
    "washer fluid, a dead 12V battery jump-start, a burnt-out bulb). If "
    "there is any doubt, safety risk, or the issue could involve brakes, "
    "steering, airbags, the fuel system, or engine internals, classify it "
    "as needing a mechanic. When uncertain, prefer 'mechanic'.\n\n"
    "Respond with ONLY a JSON object, no other text and no markdown code "
    "fences, in exactly this shape:\n"
    '{"recommendation": "diy" or "mechanic", "guidance": "2-4 short '
    'plain-language sentences"}'
)

# Returned whenever a response was received but couldn't be parsed into a
# confident answer — biases toward caution rather than guessing DIY.
DEFAULT_RESULT = {
    "recommendation": "mechanic",
    "guidance": (
        "We couldn't confidently assess this issue from the description "
        "given — please have a mechanic take a look to be safe."
    ),
}


class LLMError(Exception):
    """Raised when no LLM provider could produce a response at all. Its
    message is safe to show to the end user — never wraps a raw
    exception or stack trace."""


class _GeminiUnavailable(Exception):
    """
    Internal signal that Gemini couldn't serve this request right now —
    used only to trigger the Groq fallback, never escapes this module.

    Covers 429 (rate limit, per CAR-19's AC) and also 5xx / a transport
    failure: live testing against the real Gemini API turned up frequent
    "503 currently experiencing high demand" responses on the free tier,
    which is functionally the same "try the other provider" situation as
    a rate limit, so it's treated the same way. A non-429/5xx failure
    (e.g. 400/401 — a request or config problem) is NOT covered here and
    surfaces directly, since Groq would likely fail the same way and the
    real cause is more useful to see than a masked retry.
    """


def _build_prompt(description: str, car_context: dict) -> str:
    """Builds the user-turn prompt from the issue description and the
    car's make/model/year (whichever fields are available)."""
    car_line = ", ".join(
        str(value)
        for value in (
            car_context.get("year"),
            car_context.get("make"),
            car_context.get("model"),
        )
        if value
    )
    vehicle = car_line or "an unspecified vehicle"
    return f"Vehicle: {vehicle}\nIssue described by the owner: {description}"


def _parse_response(text: str) -> dict:
    """
    Parses a provider's raw reply into {"recommendation", "guidance"}.
    Falls back to DEFAULT_RESULT (the cautious mechanic recommendation)
    on any missing, malformed, or ambiguous response, rather than ever
    guessing DIY.
    """
    if not text:
        return DEFAULT_RESULT

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        first_line, _, rest = cleaned.partition("\n")
        cleaned = rest if first_line.strip().lower() in ("json", "") else cleaned

    try:
        parsed = json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        return DEFAULT_RESULT

    if not isinstance(parsed, dict):
        return DEFAULT_RESULT

    recommendation = parsed.get("recommendation")
    guidance = parsed.get("guidance")
    if recommendation not in ("diy", "mechanic"):
        return DEFAULT_RESULT
    if not isinstance(guidance, str) or not guidance.strip():
        return DEFAULT_RESULT

    return {"recommendation": recommendation, "guidance": guidance.strip()}


def _call_gemini(prompt: str) -> str:
    """Calls Gemini; raises _GeminiUnavailable on 429/5xx/a transport
    failure (triggers the Groq fallback), httpx.HTTPError on any other
    failure (e.g. a 400/401 request or config problem)."""
    try:
        response = httpx.post(
            GEMINI_URL,
            params={"key": GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            },
            timeout=20.0,
        )
    except httpx.HTTPError as error:
        raise _GeminiUnavailable() from error

    if response.status_code == 429 or response.status_code >= 500:
        raise _GeminiUnavailable()
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_groq(prompt: str) -> str:
    """Calls Groq (OpenAI-compatible chat completions); raises
    httpx.HTTPError on any failure."""
    response = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
        json={
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=20.0,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def classify_issue(description: str, car_context: dict) -> dict:
    """
    Classifies a described car issue as DIY-fixable or needing a
    mechanic, using Gemini as the primary provider and Groq as an
    automatic fallback when Gemini is rate-limited.

    Args:
        description: The owner's free-text description of the issue.
        car_context: A dict with any of "make", "model", "year" for the
            car in question — included in the prompt for better context.

    Returns:
        {"recommendation": "diy" | "mechanic", "guidance": str}. Falls
        back to a cautious "mechanic" recommendation if a response was
        received but couldn't be confidently parsed.

    Raises:
        LLMError: if no provider could produce a response at all (e.g.
            Gemini is unavailable and Groq isn't configured or also
            fails, or a non-retryable Gemini failure occurs).
    """
    prompt = _build_prompt(description, car_context)

    provider = "gemini"
    try:
        raw_text = _call_gemini(prompt)
    except _GeminiUnavailable as error:
        if not GROQ_API_KEY:
            raise LLMError(
                "Could not get advice right now. Please try again shortly."
            ) from error
        provider = "groq"
        try:
            raw_text = _call_groq(prompt)
        except httpx.HTTPError as groq_error:
            raise LLMError(
                "Could not get advice right now. Please try again."
            ) from groq_error
    except httpx.HTTPError as error:
        raise LLMError("Could not get advice right now. Please try again.") from error

    # Logged for debugging/demo purposes only — never exposed to the client.
    logger.info("AI Advisor classification served by %s", provider)

    return _parse_response(raw_text)
