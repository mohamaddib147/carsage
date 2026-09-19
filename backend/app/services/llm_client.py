# Isolates all LLM calls behind this module (classify_issue for the AI
# Advisor, estimate_tank_capacity for Car Onboarding's autofill), so the
# rest of the app never talks to a provider directly and the
# provider could be swapped without touching the router. Gemini is the
# primary provider; Groq is an automatic fallback used only when Gemini
# returns a 429 (rate limit). Both providers are prompted for the exact
# same JSON shape so the caller never has to know which one answered.

import json
import logging
import re

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

# CAR-44/49 autofill: no free vehicle-spec API exposes fuel tank capacity
# (API Ninjas, NHTSA and fueleconomy.gov have no such field), so Car
# Onboarding asks the same LLM for the typical factory figure instead.
# It's an estimate, always shown to the user as such and always editable.
TANK_SYSTEM_PROMPT = (
    "You are an automotive specifications reference. Given a vehicle's year, "
    "make and model, give the typical factory fuel tank capacity in LITERS "
    "for its most common trim (US gallons x 3.785 = liters). Only answer if "
    "it is a real, existing vehicle model and you are reasonably confident "
    "of the figure; otherwise answer null.\n\nRespond with ONLY a JSON "
    "object, no other text and no markdown code fences, in exactly this "
    'shape:\n{"tank_liters": <number or null>}'
)
# Realistic tank range in liters — must match the frontend
# (lib/tankCapacity.js) and the cars.fuel_tank_capacity_liters CHECK.
MIN_TANK_LITERS = 5
MAX_TANK_LITERS = 200

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


def _call_gemini(
    prompt: str, system_prompt: str = SYSTEM_PROMPT, timeout: float = 20.0
) -> str:
    """Calls Gemini; raises _GeminiUnavailable on 429/5xx/a transport
    failure (triggers the Groq fallback), httpx.HTTPError on any other
    failure (e.g. a 400/401 request or config problem)."""
    try:
        response = httpx.post(
            GEMINI_URL,
            params={"key": GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {"parts": [{"text": system_prompt}]},
            },
            timeout=timeout,
        )
    except httpx.HTTPError as error:
        raise _GeminiUnavailable() from error

    if response.status_code == 429 or response.status_code >= 500:
        raise _GeminiUnavailable()
    response.raise_for_status()
    data = response.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def _call_groq(
    prompt: str, system_prompt: str = SYSTEM_PROMPT, timeout: float = 20.0
) -> str:
    """Calls Groq (OpenAI-compatible chat completions); raises
    httpx.HTTPError on any failure."""
    response = httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
        json={
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=timeout,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def _complete(
    prompt: str, system_prompt: str, timeout: float = 20.0, failure_message: str = ""
) -> tuple[str, str]:
    """
    Gets a text completion from Gemini, falling back to Groq when Gemini is
    unavailable (429 / 5xx / transport failure).

    Returns:
        (raw reply text, name of the provider that served it).

    Raises:
        LLMError: if no provider could produce a response at all.
    """
    try:
        return _call_gemini(prompt, system_prompt, timeout), "gemini"
    except _GeminiUnavailable as error:
        if not GROQ_API_KEY:
            raise LLMError(failure_message) from error
        try:
            return _call_groq(prompt, system_prompt, timeout), "groq"
        except httpx.HTTPError as groq_error:
            raise LLMError(failure_message) from groq_error
    except httpx.HTTPError as error:
        raise LLMError(failure_message) from error


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

    raw_text, provider = _complete(
        prompt,
        SYSTEM_PROMPT,
        failure_message="Could not get advice right now. Please try again.",
    )

    # Logged for debugging/demo purposes only — never exposed to the client.
    logger.info("AI Advisor classification served by %s", provider)

    return _parse_response(raw_text)


def _parse_tank_response(text: str) -> float | None:
    """Parses a reply of the form {"tank_liters": number | null} into a
    liters figure, or None if it is missing, malformed, null, a bool, or
    outside the realistic 5-200 L range (an implausible value is dropped,
    never passed on)."""
    match = re.search(r"\{.*\}", text or "", re.S)
    if not match:
        return None
    try:
        value = json.loads(match.group(0)).get("tank_liters")
    except (json.JSONDecodeError, AttributeError):
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not MIN_TANK_LITERS <= value <= MAX_TANK_LITERS:
        return None
    return round(float(value), 1)


def estimate_tank_capacity(make: str, model: str, year: int) -> float | None:
    """
    Asks the LLM for a vehicle's typical fuel tank capacity in liters, for
    Car Onboarding's autofill (no free spec API provides it).

    Args:
        make: Vehicle make, e.g. "Toyota".
        model: Vehicle model, e.g. "Camry".
        year: Model year.

    Returns:
        Liters (5-200), or None if the model isn't confident / doesn't
        recognise the vehicle / the reply is unusable. Never raises — this
        is a best-effort convenience that must not block onboarding.
    """
    prompt = f"Vehicle: {year} {make} {model}"
    try:
        raw_text, provider = _complete(
            prompt, TANK_SYSTEM_PROMPT, timeout=10.0, failure_message="unavailable"
        )
    except (LLMError, KeyError, IndexError, TypeError, ValueError):
        return None

    logger.info("Tank capacity estimate served by %s", provider)
    return _parse_tank_response(raw_text)
