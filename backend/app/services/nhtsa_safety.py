# Grounds AI Advisor's DIY-vs-mechanic recommendation in NHTSA's official
# safety data (CAR-36): checks the car's open recalls and complaint
# history for a match against keywords from the user's described issue,
# so a recommendation can say "there's an official recall for this exact
# symptom" instead of relying solely on the LLM's general knowledge.
# Every lookup is best-effort — any failure degrades to "no safety data
# available" rather than blocking the AI Advisor response.
#
# Design note: NHTSA's Recalls/Complaints APIs give no way to tell "this
# vehicle isn't in our system" apart from "this vehicle has a clean
# record" — both return {"Count": 0, "results": []} identically
# (confirmed live: a nonexistent make and a real US car with zero
# recalls return the exact same shape). To honor the AC's requirement to
# report US-market non-coverage explicitly rather than silently treating
# it as "no match," this reuses vehicle_lookup.lookup_nhtsa (NHTSA vPIC —
# a genuinely different NHTSA API that can confirm whether a make/model/
# year exists at all) as the "not found" signal, only when both Recalls
# and Complaints came back empty.

import re

import httpx

from app.services.vehicle_lookup import lookup_nhtsa

RECALLS_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle"
COMPLAINTS_URL = "https://api.nhtsa.gov/complaints/complaintsByVehicle"

# A single open recall matching the described issue is always significant
# enough to surface — recalls are investigated and confirmed by NHTSA.
# A complaint is far noisier (self-reported, unverified), so this
# requires several keyword-matching complaints before calling it a
# "pattern" worth surfacing, rather than one report that happens to
# share a word with the user's description. No official NHTSA guidance
# sets this number — 3 is a deliberate, documented judgment call.
COMPLAINT_PATTERN_THRESHOLD = 3

STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "my", "car", "vehicle",
    "when", "while", "and", "or", "to", "it", "its", "in", "on", "at",
    "of", "for", "with", "this", "that", "has", "have", "i", "me",
    "makes", "making", "sound", "noise", "issue", "problem",
}


def _extract_keywords(description: str) -> set[str]:
    """Pulls significant words (4+ letters, not a stopword) out of a
    free-text issue description, for matching against NHTSA records."""
    words = re.findall(r"[a-zA-Z]+", description.lower())
    return {word for word in words if len(word) >= 4 and word not in STOPWORDS}


def _matches(text: str, keywords: set[str]) -> bool:
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in keywords)


def _fetch_results(url: str, make: str, model: str, year: int) -> list[dict] | None:
    """
    Fetches one NHTSA endpoint's `results` list. Returns None (not an
    empty list) on any genuine failure, so callers can tell "fetched,
    zero results" apart from "couldn't fetch".

    Deliberately does NOT call response.raise_for_status(): confirmed
    live that both recallsByVehicle and complaintsByVehicle return HTTP
    400 — not 200 — specifically when the result set is legitimately
    empty (body is still well-formed: {"Count": 0, "Message": "Results
    returned successfully", "results": []}), while a real network/
    transport failure never produces a parseable body at all. So the
    body is parsed regardless of status code, and only a request that
    couldn't be completed or didn't return valid JSON counts as a
    failure.
    """
    try:
        response = httpx.get(
            url,
            params={"make": make, "model": model, "modelYear": year},
            timeout=10.0,
        )
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    if not isinstance(data, dict) or "results" not in data:
        return None
    return data["results"]


def check_safety_data(make: str, model: str, year: int, description: str) -> dict:
    """
    Checks NHTSA's Recalls and Complaints APIs for a match against the
    described issue.

    Returns one of:
        {"status": "recall_match", "summary": str}
        {"status": "complaint_pattern", "count": int, "summary": str}
        {"status": "not_found"} — NHTSA vPIC doesn't recognize this
            make/model/year at all, so safety data (US-market only)
            genuinely isn't available for it — distinct from a clean
            record (see module docstring for why this needs vPIC).
        {"status": "no_match"} — data was available; nothing matched.
        {"status": "unavailable"} — the NHTSA API(s) couldn't be
            reached; never raises, caller should fall back to LLM-only.
    """
    recalls = _fetch_results(RECALLS_URL, make, model, year)
    complaints = _fetch_results(COMPLAINTS_URL, make, model, year)

    if recalls is None or complaints is None:
        return {"status": "unavailable"}

    keywords = _extract_keywords(description)

    matching_recalls = [
        recall
        for recall in recalls
        if _matches(f"{recall.get('Component', '')} {recall.get('Summary', '')}", keywords)
    ]
    if matching_recalls:
        return {"status": "recall_match", "summary": matching_recalls[0].get("Summary", "")}

    matching_complaints = [
        complaint
        for complaint in complaints
        if _matches(
            f"{complaint.get('components', '')} {complaint.get('summary', '')}", keywords
        )
    ]
    if len(matching_complaints) >= COMPLAINT_PATTERN_THRESHOLD:
        return {
            "status": "complaint_pattern",
            "count": len(matching_complaints),
            "summary": matching_complaints[0].get("summary", ""),
        }

    if not recalls and not complaints:
        vpic = lookup_nhtsa(make, model, year)
        if not vpic["vehicle_confirmed"]:
            return {"status": "not_found"}

    return {"status": "no_match"}
