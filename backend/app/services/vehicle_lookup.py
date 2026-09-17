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
        to km/L, matching the unit `cars.fuel_efficiency` is stored in.
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


def get_spec_suggestions(make: str, model: str, year: int) -> dict:
    """
    Combines the NHTSA and API Ninjas lookups into one autofill suggestion
    for Car Onboarding. Always returns a complete shape (fields are None
    when not found) — never raises, so a lookup failure never blocks the
    user from completing onboarding manually.
    """
    return {
        **lookup_nhtsa(make, model, year),
        **lookup_api_ninjas(make, model, year),
    }
