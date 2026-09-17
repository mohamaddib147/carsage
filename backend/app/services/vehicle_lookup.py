# Best-effort car spec autofill for Car Onboarding (CAR-34): looks up a
# make/model/year against NHTSA vPIC (free, no key, confirms the vehicle
# exists and gives an approximate vehicle/body type) and API Ninjas' Cars
# API (free tier, needs API_NINJAS_KEY, gives fuel economy + drivetrain
# specs). Both lookups are strictly best-effort — any failure or no-match
# is swallowed and reported back as missing data, never raised, so a car
# that isn't in either database (e.g. not sold in the US) never blocks
# onboarding.

import httpx

from app.config import API_NINJAS_KEY

NHTSA_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles"
API_NINJAS_URL = "https://api.api-ninjas.com/v1/cars"
FUEL_ECONOMY_BASE_URL = "https://www.fueleconomy.gov/ws/rest/vehicle"

# 1 mile = 1.60934 km, 1 US gallon = 3.78541 L, so mpg -> km/L is this factor.
MPG_TO_KM_PER_LITER = 1.60934 / 3.78541


def lookup_nhtsa(make: str, model: str, year: int) -> dict:
    """
    Confirms a make/model/year exists in NHTSA vPIC and returns an
    approximate vehicle type for it.

    vPIC has no free endpoint that returns true per-model engine specs
    without decoding a real VIN, so "engine_type" here is the vehicle's
    general NHTSA vehicle type (e.g. "Passenger Car", "Truck") — the
    closest available signal, not a literal engine spec.

    Returns:
        {"vehicle_confirmed": bool, "engine_type": str | None}. Always
        this shape, even on a network/API failure — never raises, since
        this is a non-critical autofill lookup.
    """
    try:
        response = httpx.get(
            f"{NHTSA_BASE_URL}/GetModelsForMakeYear/make/{make}/modelyear/{year}",
            params={"format": "json"},
            timeout=8.0,
        )
        response.raise_for_status()
        results = response.json().get("Results", [])
    except httpx.HTTPError:
        return {"vehicle_confirmed": False, "engine_type": None}

    confirmed = any(
        result.get("Model_Name", "").strip().lower() == model.strip().lower()
        for result in results
    )
    if not confirmed:
        return {"vehicle_confirmed": False, "engine_type": None}

    engine_type = None
    try:
        type_response = httpx.get(
            f"{NHTSA_BASE_URL}/GetVehicleTypesForMake/{make}",
            params={"format": "json"},
            timeout=8.0,
        )
        type_response.raise_for_status()
        type_results = type_response.json().get("Results", [])
        if type_results:
            engine_type = type_results[0].get("VehicleTypeName")
    except httpx.HTTPError:
        pass

    return {"vehicle_confirmed": True, "engine_type": engine_type}


def lookup_api_ninjas(make: str, model: str, year: int) -> dict:
    """
    Looks up detailed specs (fuel economy, cylinders, drivetrain,
    transmission) from API Ninjas' Cars API.

    Returns:
        {"fuel_efficiency": float | None, "cylinders": int | None,
         "drivetrain": str | None, "transmission": str | None}. All None
        (never raises) if API_NINJAS_KEY isn't configured, the API call
        fails, or there's no match for this make/model/year.
        fuel_efficiency is converted from the API's combined MPG figure
        to km/L, matching the unit `cars.fuel_efficiency` is stored in —
        NOTE: API Ninjas' free tier gates all MPG fields behind a paid
        plan (they come back as the literal string "this field is for
        premium subscribers only" instead of a number), so this is
        effectively always None on a free key; get_spec_suggestions()
        falls back to lookup_fuel_economy() for this field instead.
    """
    empty = {
        "fuel_efficiency": None,
        "cylinders": None,
        "drivetrain": None,
        "transmission": None,
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
    """
    nhtsa = lookup_nhtsa(make, model, year)
    ninjas = lookup_api_ninjas(make, model, year)
    fuel_efficiency = ninjas["fuel_efficiency"]
    if fuel_efficiency is None:
        fuel_efficiency = lookup_fuel_economy(make, model, year)

    return {**nhtsa, **ninjas, "fuel_efficiency": fuel_efficiency}
