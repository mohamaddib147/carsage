# Best-effort car spec autofill for Car Onboarding (CAR-34): looks up a
# make/model/year against NHTSA vPIC (free, no key, confirms the vehicle
# exists and gives an approximate vehicle/body type) and API Ninjas' Cars
# API (free tier, needs API_NINJAS_KEY, gives fuel economy + drivetrain
# specs). Both lookups are strictly best-effort — any failure or no-match
# is swallowed and reported back as missing data, never raised, so a car
# that isn't in either database (e.g. not sold in the US) never blocks
# onboarding.

import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import httpx

from app.config import API_NINJAS_KEY
from app.services.llm_client import estimate_tank_capacity
from app.services.tank_capacity_lookup import lookup_tank_capacity

NHTSA_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles"
API_NINJAS_URL = "https://api.api-ninjas.com/v1/cars"
FUEL_ECONOMY_BASE_URL = "https://www.fueleconomy.gov/ws/rest/vehicle"

# CAR-49: realistic fuel tank range in liters. Must match the frontend
# (lib/tankCapacity.js) and the cars.fuel_tank_capacity_liters CHECK
# constraint, so a stray or mis-scaled value can never be stored or used.
MIN_TANK_LITERS = 5
MAX_TANK_LITERS = 200

# 1 mile = 1.60934 km, 1 US gallon = 3.78541 L, so mpg -> km/L is this factor.
MPG_TO_KM_PER_LITER = 1.60934 / 3.78541


# NHTSA often lists a vehicle by its model FAMILY rather than the badge on the
# car: a Mercedes "C230 Kompressor" is "C-Class", a BMW "328i" is "3 Series".
_MODEL_FAMILY = re.compile(r"^(?P<base>.+?)[\s-]+(class|series)$", re.IGNORECASE)


def match_nhtsa_model(model: str, official_names: list[str]) -> str | None:
    """
    Finds the name NHTSA uses for the model the user typed.

    Tried in order, first hit wins:
      1. the same name, ignoring case ("civic" -> "Civic");
      2. the user's text is an official name plus a trim ("Camry LE" -> "Camry"),
         preferring the longest such name ("Corolla Cross LE" -> "Corolla Cross");
      3. the official name is a family and the user's text is the family letter or
         number followed by digits ("C230 Kompressor" -> "C-Class", "328i" ->
         "3 Series"). The digit is required so "CLK320" is not read as "C-Class".

    Parameters:
        model: what the user saved as the car's model.
        official_names: the model names NHTSA lists for that make and year.

    Returns:
        The NHTSA spelling, or None if nothing matches.
    """
    wanted = " ".join(model.lower().split())
    names = [name.strip() for name in official_names if name and name.strip()]
    if not wanted:
        return None

    for name in names:
        if name.lower() == wanted:
            return name

    with_trim = [
        name
        for name in names
        if wanted.startswith(name.lower())
        and len(wanted) > len(name)
        and wanted[len(name)] in " -"
    ]
    if with_trim:
        return max(with_trim, key=len)

    compact = re.sub(r"[^a-z0-9]", "", wanted)
    families = []
    for name in names:
        family = _MODEL_FAMILY.match(name)
        if not family:
            continue
        base = re.sub(r"[^a-z0-9]", "", family["base"].lower())
        if base and len(compact) > len(base) and compact.startswith(base) and compact[len(base)].isdigit():
            families.append((len(base), name))
    # A longer family letter wins, so "CL500" picks "CL-Class" over "C-Class".
    return max(families)[1] if families else None


def lookup_nhtsa(make: str, model: str, year: int) -> dict:
    """
    Confirms a make/model/year exists in NHTSA vPIC.

    "engine_type" is always None here: vPIC has no free endpoint that
    returns true per-model engine specs without decoding a real VIN. An
    earlier version filled it with NHTSA's general vehicle type instead
    (e.g. "Passenger Car", "Truck") as an approximation, but that's a body
    classification, not an engine spec, and auto-filling "Engine Type"
    with "Passenger Car" under a "✓ Auto-filled" tag was misleading in
    practice (confirmed live) — worse than leaving the field for the user
    to fill in themselves. The key stays in the response shape (rather
    than being removed) so a real per-model source could populate it
    later without a breaking change.

    Returns:
        {"vehicle_confirmed": bool, "engine_type": None,
        "model_name": str | None} — model_name is NHTSA's own name for the
        model (see match_nhtsa_model), which the safety check needs because
        NHTSA's recall/complaint data is filed under it. Always this shape,
        even on a network/API failure — never raises, since this is a
        non-critical autofill lookup.
    """
    try:
        response = httpx.get(
            # make goes into the URL PATH, so it is percent-encoded (safe="" also
            # encodes "/"): a make like "x/../y?z" can never change the path or query.
            f"{NHTSA_BASE_URL}/GetModelsForMakeYear/make/{quote(make.strip(), safe='')}/modelyear/{int(year)}",
            params={"format": "json"},
            timeout=8.0,
        )
        response.raise_for_status()
        results = response.json().get("Results", [])
    except httpx.HTTPError:
        return {"vehicle_confirmed": False, "engine_type": None, "model_name": None}

    official_name = match_nhtsa_model(model, [result.get("Model_Name", "") for result in results])
    if official_name is None:
        return {"vehicle_confirmed": False, "engine_type": None, "model_name": None}

    return {"vehicle_confirmed": True, "engine_type": None, "model_name": official_name}


def _extract_engine_type(car: dict) -> str | None:
    """
    Builds a real engine description ("1.5L 4-Cylinder") from API Ninjas'
    `displacement` (engine size in liters) and `cylinders` fields, or None
    if either is missing/implausible. Both are genuinely per-model engine
    facts (unlike NHTSA's vehicle-type category, see lookup_nhtsa) and
    come through on the free tier — confirmed live, not gated like the
    MPG fields. Cylinder layout (inline vs. V) isn't in the response, so
    this never guesses "I4"/"V6" — just the plain count, which is always
    correct given what's actually known.
    """
    displacement = car.get("displacement")
    cylinders = car.get("cylinders")
    if isinstance(displacement, bool) or not isinstance(displacement, (int, float)):
        return None
    if isinstance(cylinders, bool) or not isinstance(cylinders, int):
        return None
    if not (0 < displacement <= 20) or not (0 < cylinders <= 16):
        return None
    return f"{displacement}L {cylinders}-Cylinder"


def _extract_tank_capacity(car: dict) -> float | None:
    """
    Returns a fuel tank capacity in liters from an API Ninjas car record,
    or None if there isn't one (CAR-44). API Ninjas' documented response
    fields don't guarantee a tank capacity, so rather than hardcode a
    field name that may never exist, this accepts any key containing
    "tank" whose value is a number within the realistic 5-200 L range (not
    the premium-tier placeholder string, not a bool, and nothing outside
    the range — an implausible value is dropped rather than autofilled).
    Assumes liters — the only unit `cars.fuel_tank_capacity_liters` stores.
    """
    for key, value in car.items():
        if "tank" not in key.lower():
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        if MIN_TANK_LITERS <= value <= MAX_TANK_LITERS:
            return float(value)
    return None


def lookup_api_ninjas(make: str, model: str, year: int) -> dict:
    """
    Looks up detailed specs (fuel economy, cylinders, drivetrain,
    transmission, a real engine description, and — only if the response
    happens to include one — fuel tank capacity) from API Ninjas' Cars
    API.

    Returns:
        {"fuel_efficiency": float | None, "cylinders": int | None,
         "drivetrain": str | None, "transmission": str | None,
         "engine_type": str | None, "fuel_tank_capacity_liters": float | None}.
        All None (never raises) if API_NINJAS_KEY isn't configured, the
        API call fails, or there's no match for this make/model/year.
        fuel_efficiency is converted from the API's combined MPG figure
        to km/L, matching the unit `cars.fuel_efficiency` is stored in —
        NOTE: API Ninjas' free tier gates all MPG fields behind a paid
        plan (they come back as the literal string "this field is for
        premium subscribers only" instead of a number), so this is
        effectively always None on a free key; get_spec_suggestions()
        falls back to lookup_fuel_economy() for this field instead.
        engine_type is built from `displacement` + `cylinders` (see
        _extract_engine_type) — both come through on the free tier,
        unlike the MPG fields.
    """
    empty = {
        "fuel_efficiency": None,
        "cylinders": None,
        "drivetrain": None,
        "transmission": None,
        "engine_type": None,
        "fuel_tank_capacity_liters": None,
    }
    if not API_NINJAS_KEY:
        return empty

    try:
        response = httpx.get(
            API_NINJAS_URL,
            params={"make": make, "model": model, "year": year},
            headers={"X-Api-Key": API_NINJAS_KEY},
            timeout=8.0,
        )
        response.raise_for_status()
        results = response.json()
    except httpx.HTTPError:
        return empty

    if not results:
        return empty

    car = results[0]
    combination_mpg = car.get("combination_mpg")
    fuel_efficiency = (
        round(combination_mpg * MPG_TO_KM_PER_LITER, 1)
        if isinstance(combination_mpg, (int, float))
        else None
    )

    return {
        "fuel_efficiency": fuel_efficiency,
        "cylinders": car.get("cylinders"),
        "drivetrain": car.get("drive"),
        "transmission": car.get("transmission"),
        "engine_type": _extract_engine_type(car),
        "fuel_tank_capacity_liters": _extract_tank_capacity(car),
    }


def _menu_items(payload) -> list[dict]:
    """
    fueleconomy.gov's XML-to-JSON conversion collapses a <menuItem> list
    with exactly one entry into a bare object instead of a one-item
    array, and returns the literal JSON body `null` (not an empty object)
    for a make/year with no menu at all. This normalizes every shape into
    a list, so callers never have to special-case any of it.
    """
    if not isinstance(payload, dict):
        return []
    items = payload.get("menuItem", [])
    return [items] if isinstance(items, dict) else items


def lookup_fuel_economy(make: str, model: str, year: int) -> float | None:
    """
    Looks up official EPA combined fuel economy from fueleconomy.gov
    (free, no key, US government data) and converts it to km/L. Used
    instead of API Ninjas for fuel_efficiency specifically, since API
    Ninjas gates its MPG fields behind a paid tier (see lookup_api_ninjas).

    The lookup is a 3-step menu walk (fueleconomy.gov has no direct
    make/model/year -> MPG endpoint): find the exact model name for this
    make/year, find a vehicle id for that model (the first trim/engine
    option if there are several — good enough for an autofill suggestion
    the user can always correct), then fetch that vehicle's combined MPG.

    Returns:
        The combined fuel economy in km/L, or None on any no-match or
        failure at any step — never raises.
    """
    headers = {"Accept": "application/json"}

    try:
        models_response = httpx.get(
            f"{FUEL_ECONOMY_BASE_URL}/menu/model",
            params={"year": year, "make": make},
            headers=headers,
            timeout=8.0,
        )
        models_response.raise_for_status()
        model_items = _menu_items(models_response.json())
    except httpx.HTTPError:
        return None

    # fueleconomy.gov often lists a model under a trim-qualified name (e.g.
    # a 2005 "C230" is listed as "C230 Kompressor"), so an exact match is
    # preferred but a "starts with the model name, then a space" match is
    # accepted too — picking the shortest such match keeps the plainest
    # trim (over e.g. a "(Wagon)" variant) as the autofill suggestion.
    model_lower = model.strip().lower()
    candidates = [
        item["text"]
        for item in model_items
        if item.get("text", "").strip().lower() == model_lower
        or item.get("text", "").strip().lower().startswith(f"{model_lower} ")
    ]
    if not candidates:
        return None
    matched_model = min(candidates, key=len)

    try:
        options_response = httpx.get(
            f"{FUEL_ECONOMY_BASE_URL}/menu/options",
            params={"year": year, "make": make, "model": matched_model},
            headers=headers,
            timeout=8.0,
        )
        options_response.raise_for_status()
        option_items = _menu_items(options_response.json())
    except httpx.HTTPError:
        return None

    if not option_items or not option_items[0].get("value"):
        return None
    vehicle_id = option_items[0]["value"]

    try:
        detail_response = httpx.get(
            f"{FUEL_ECONOMY_BASE_URL}/{vehicle_id}",
            headers=headers,
            timeout=8.0,
        )
        detail_response.raise_for_status()
        detail_payload = detail_response.json()
        combined_mpg = (
            detail_payload.get("comb08") if isinstance(detail_payload, dict) else None
        )
    except httpx.HTTPError:
        return None

    try:
        combined_mpg = float(combined_mpg)
    except (TypeError, ValueError):
        return None
    if combined_mpg <= 0:
        return None

    return round(combined_mpg * MPG_TO_KM_PER_LITER, 1)


def get_spec_suggestions(make: str, model: str, year: int) -> dict:
    """
    Combines the NHTSA, API Ninjas, and fueleconomy.gov lookups into one
    autofill suggestion for Car Onboarding. Always returns a complete
    shape (fields are None when not found) — never raises, so a lookup
    failure never blocks the user from completing onboarding manually.
    fuel_efficiency prefers API Ninjas' figure (in case a paid key is
    ever configured) and falls back to fueleconomy.gov, since API
    Ninjas' free tier doesn't include it.

    engine_type comes from API Ninjas (displacement + cylinders, e.g.
    "1.5L 4-Cylinder" — see _extract_engine_type) when available, since
    NHTSA's own contribution is always None (see lookup_nhtsa); the dict
    merge order below lets API Ninjas' value win when it has one.

    Fuel tank capacity, best source first, with the winner reported in
    `fuel_tank_capacity_source` so the UI can label it: API Ninjas if it
    ever has one, else the real spec sheet on auto-data.net
    (tank_capacity_lookup), else — only when neither has it — an AI
    estimate (llm_client.estimate_tank_capacity, kept inside 5-200 L) that
    the UI flags as a guess to verify.
    """
    def ninjas_then_fuel_economy():
        # fueleconomy.gov is only needed if API Ninjas has no efficiency,
        # so this pair stays sequential within its own worker.
        ninjas_result = lookup_api_ninjas(make, model, year)
        efficiency = ninjas_result["fuel_efficiency"]
        if efficiency is None:
            efficiency = lookup_fuel_economy(make, model, year)
        return ninjas_result, efficiency

    # The lookups are independent network calls, so run them side by side:
    # total time is the slowest one rather than the sum. The auto-data.net
    # tank lookup runs speculatively (its result is ignored if API Ninjas
    # turns out to have a tank value).
    with ThreadPoolExecutor(max_workers=3) as pool:
        nhtsa_future = pool.submit(lookup_nhtsa, make, model, year)
        specs_future = pool.submit(ninjas_then_fuel_economy)
        tank_future = pool.submit(lookup_tank_capacity, make, model, year)
        nhtsa = nhtsa_future.result()
        ninjas, fuel_efficiency = specs_future.result()
        looked_up_tank = tank_future.result()

    tank_capacity = ninjas.get("fuel_tank_capacity_liters")
    tank_source = "api_ninjas" if tank_capacity is not None else None
    if tank_capacity is None:
        tank_capacity = looked_up_tank
        tank_source = "auto_data" if tank_capacity is not None else None
    if tank_capacity is None:
        tank_capacity = estimate_tank_capacity(make, model, year)
        tank_source = "ai_estimate" if tank_capacity is not None else None

    return {
        # model_name is only for the safety check, not part of this response.
        **{key: value for key, value in nhtsa.items() if key != "model_name"},
        **ninjas,
        "fuel_efficiency": fuel_efficiency,
        "fuel_tank_capacity_liters": tank_capacity,
        "fuel_tank_capacity_source": tank_source,
    }
