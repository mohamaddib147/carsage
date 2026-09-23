# Grounds AI Advisor's DIY-vs-mechanic recommendation in NHTSA's official
# safety data (CAR-36): checks the car's open recalls and complaint
# history for a match against the user's described issue, so a
# recommendation can say "there's an official recall on this system"
# instead of relying solely on the LLM's general knowledge.
# Every lookup is best-effort — any failure degrades to "no safety data
# available" rather than blocking the AI Advisor response.
#
# Matching approach (rewritten for CAR-22 — the original matched ANY 4+
# letter word from the description against the free text of every recall
# and complaint, so common words like "right", "after" or "engine"
# matched almost everything: a cracked cup holder or a dead battery was
# reported as an NHTSA recall/complaint pattern, which forced 'mechanic'
# for nearly every question and made the DIY path unreachable):
#   1. Work out which vehicle SYSTEM(S) the description is about (brakes,
#      air bags, steering, fuel, ...) from a small vocabulary
#      (SYSTEM_VOCABULARY). No recognizable system -> no NHTSA match; the
#      LLM handles it alone.
#   2. A recall matches when its NHTSA `Component` field is in one of
#      those systems. Recalls are rare and officially confirmed, so for
#      SAFETY-CRITICAL systems (brakes, air bags, steering, fuel, tires,
#      ...) an open recall on the same system is always worth surfacing.
#      For other systems (engine, electrical, lighting, ...) the recall
#      must also share a symptom word with the description, so an
#      unrelated recall doesn't override an otherwise DIY question.
#   3. Complaints are far noisier (self-reported), so a complaint only
#      counts when it is in the same system AND its text shares specific
#      symptom words with the description (at least two, or the only one
#      if that is all the description has), and it takes several such
#      complaints (COMPLAINT_PATTERN_THRESHOLD) to call it a pattern —
#      twice as many when only a single symptom word is shared, since one
#      shared word is weak evidence.
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

# A complaint is far noisier than a recall (self-reported, unverified), so
# this many matching complaints are required before calling it a
# "pattern" worth surfacing. No official NHTSA guidance sets this number —
# 3 is a deliberate, documented judgment call.
COMPLAINT_PATTERN_THRESHOLD = 3

# Each entry: (label shown to the user, substrings of NHTSA's component
# names that belong to this system, regex over the lowercased description
# that signals the owner is talking about this system, whether the system
# is safety-critical). NHTSA components look like "SERVICE BRAKES,
# HYDRAULIC", "AIR BAGS:SENSOR", "FUEL SYSTEM, GASOLINE", "POWER
# TRAIN:AUTOMATIC TRANSMISSION", "ELECTRICAL SYSTEM".
SYSTEM_VOCABULARY = (
    ("brakes", ("BRAKE",), r"\bbrak|\babs\b", True),
    ("air bags", ("AIR BAG", "AIRBAG"), r"air ?bags?|\bsrs\b", True),
    ("steering", ("STEERING",), r"steering", True),
    ("fuel system", ("FUEL",), r"\bfuel|gasoline|petrol|diesel|gas (?:cap|tank|smell|leak)", True),
    ("seat belts", ("SEAT BELT",), r"seat ?belts?", True),
    ("tires", ("TIRE",), r"\btires?\b|\btyres?\b|blowout", True),
    ("wheels", ("WHEELS",), r"\bwheels?\b|\brims?\b", True),
    ("speed control", ("SPEED CONTROL",), r"accelerat|throttle|cruise control|unintended", True),
    ("stability control", ("STABILITY",), r"stability control|traction control|\besc\b", True),
    ("engine", ("ENGINE",), r"engine|\bstall|misfir|overheat|coolant", False),
    ("transmission", ("POWER TRAIN",), r"transmission|gearbox|clutch|\bshifting|\bgears?\b", False),
    ("electrical system", ("ELECTRICAL",), r"electrical|battery|alternator|starter|\bfuses?\b|wiring", False),
    ("suspension", ("SUSPENSION",), r"suspension|\bshocks?\b|\bstruts?\b", False),
    ("lighting", ("LIGHTING",), r"headlights?|tail ?lights?|brake lights?|turn signals?|\bbulbs?\b", False),
    ("visibility", ("VISIBILITY",), r"\bwipers?\b|windshield|defrost|mirrors?", False),
)

# Everyday words that say nothing about the symptom, so they can't count as
# "shared symptom words" between a description and a complaint.
STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "were", "my", "car", "vehicle",
    "when", "while", "and", "or", "to", "it", "its", "in", "on", "at",
    "of", "for", "with", "this", "that", "has", "have", "i", "me",
    "makes", "making", "sound", "noise", "issue", "problem", "check",
    "light", "loose", "filled", "first", "drive", "driving", "going",
    "started", "starts", "sometimes", "always", "really", "little",
    "again", "away", "then", "still", "seems", "thing", "after", "right",
    "left", "think", "came", "comes", "about", "because", "there",
    "their", "would", "could", "which", "these", "those", "other",
    "morning", "night", "every", "times", "since", "before", "while",
}


def _systems_in(description: str) -> list[tuple[str, tuple[str, ...], str, bool]]:
    """The vehicle systems the description is about — see
    SYSTEM_VOCABULARY. Empty if none is recognizable."""
    text = description.lower()
    return [entry for entry in SYSTEM_VOCABULARY if re.search(entry[2], text)]


def _in_system(component: str, systems):
    """The first of `systems` (a SYSTEM_VOCABULARY entry) that the NHTSA
    `component` string belongs to, or None."""
    upper = (component or "").upper()
    for entry in systems:
        if any(term in upper for term in entry[1]):
            return entry
    return None


def _shared_symptoms(text: str, symptoms: set[str]) -> int:
    """How many of the description's symptom stems appear in `text`."""
    lowered = (text or "").lower()
    return sum(stem in lowered for stem in symptoms)


def _symptom_words(description: str, systems) -> set[str]:
    """Stems of the description's specific symptom words: 5+ letters, not
    an everyday word, and not just the name of the system itself (e.g.
    "brakes" says which system, not what is wrong with it)."""
    stems = set()
    for word in re.findall(r"[a-zA-Z]+", description.lower()):
        if len(word) < 5 or word in STOPWORDS:
            continue
        if any(re.search(entry[2], word) for entry in systems):
            continue
        stems.add(word[:5] if len(word) > 5 else word)
    return stems


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

    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        return None
    return data["results"]


def check_safety_data(make: str, model: str, year: int, description: str) -> dict:
    """
    Checks NHTSA's Recalls and Complaints APIs for a match against the
    described issue (see the module header for how matching works).

    Returns one of:
        {"status": "recall_match", "summary": str, "system": str} — an open
            recall in the same vehicle system as the described issue.
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

    if not recalls and not complaints:
        # Nothing under the model as the user typed it. Two very different reasons:
        # NHTSA doesn't know the vehicle at all (-> "not_found"), or it files it
        # under its own name — a Mercedes "C230 Kompressor" is "C-Class" (140
        # complaints for the 2005) — so ask vPIC for that name and look again.
        vpic = lookup_nhtsa(make, model, year)
        if not vpic["vehicle_confirmed"]:
            return {"status": "not_found"}
        official_name = vpic.get("model_name")
        if official_name and official_name.strip().lower() != model.strip().lower():
            recalls = _fetch_results(RECALLS_URL, make, official_name, year)
            complaints = _fetch_results(COMPLAINTS_URL, make, official_name, year)
            if recalls is None or complaints is None:
                return {"status": "unavailable"}

    systems = _systems_in(description)
    symptoms = _symptom_words(description, systems)

    for recall in recalls:
        entry = _in_system(recall.get("Component", ""), systems)
        if entry is None:
            continue
        recall_text = f"{recall.get('Component', '')} {recall.get('Summary', '')}"
        # Safety-critical systems always surface; others need a shared symptom.
        if entry[3] or _shared_symptoms(recall_text, symptoms) >= 1:
            return {
                "status": "recall_match",
                "summary": recall.get("Summary", ""),
                "system": entry[0],
            }

    if systems and symptoms:
        needed = min(2, len(symptoms))
        threshold = COMPLAINT_PATTERN_THRESHOLD * (2 if needed == 1 else 1)
        matching_complaints = [
            complaint
            for complaint in complaints
            if _in_system(complaint.get("components", ""), systems)
            and _shared_symptoms(complaint.get("summary"), symptoms) >= needed
        ]
        if len(matching_complaints) >= threshold:
            return {
                "status": "complaint_pattern",
                "count": len(matching_complaints),
                "summary": matching_complaints[0].get("summary", ""),
            }

    return {"status": "no_match"}
