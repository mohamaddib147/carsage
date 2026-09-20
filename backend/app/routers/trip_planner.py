# Trip Planner endpoints: Google Maps route lookup (distance + duration),
# the current default fuel price, and the full cost-estimate flow that
# ties a route + a car's fuel efficiency + a fuel price into a saved
# trip. All monetary figures (fuel_price_used, estimated_cost, in both
# `trips` and this router's responses) are LBP — the unit fuel_prices.py
# standardizes on — since liters * LBP/liter = LBP; USD is a display-only
# conversion, never the stored unit.
#
# CAR-42: the estimate response also includes a current-traffic-adjusted
# cost alongside the original light-traffic figure — see
# _traffic_adjusted_efficiency for the heuristic. Only the light-traffic
# figure is persisted to `trips.estimated_cost` (unchanged from before
# CAR-42); the traffic-adjusted one is response-only since it changes
# every time someone re-checks the same route.

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.services.fuel_prices import (
    LBP_PER_USD,
    FuelPriceError,
    get_current_fuel_prices,
    lbp_to_usd,
)
from app.services.google_maps import GoogleMapsError, get_route_summary
from app.supabase_client import supabase
from app.validation import FuelPriceLbp, PlaceText, RecordId

router = APIRouter(prefix="/trip-planner", tags=["trip-planner"])


class DirectionsRequest(BaseModel):
    # PlaceText: trimmed, 1-300 characters (CAR-23) — blank, whitespace-only
    # and oversized places are refused with a 422 before Google is called.
    destination: PlaceText
    origin: PlaceText | None = None


class DirectionsResponse(BaseModel):
    distance_km: float
    duration_min: int
    duration_in_traffic_min: int
    # CAR-48: encoded overview polyline of the driving route, for the
    # decorative static map. None if Google didn't return one.
    route_polyline: str | None = None


@router.post("/directions", response_model=DirectionsResponse)
def post_directions(payload: DirectionsRequest):
    """
    Looks up driving distance and duration between an origin and a
    destination via Google Maps.

    `origin` is optional at the request-schema level (the frontend isn't
    forced to always send one), but a route can't actually be calculated
    without it yet — there's no saved default location on a user's
    profile — so it's required for now until that exists.
    """
    if not payload.origin:
        raise HTTPException(
            status_code=400,
            detail="Origin is required to calculate a route.",
        )

    try:
        return get_route_summary(payload.origin, payload.destination)
    except GoogleMapsError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


class FuelPrice(BaseModel):
    lbp_per_liter: float
    usd_per_liter: float


class FuelPricesResponse(BaseModel):
    prices: dict[str, FuelPrice]
    lbp_per_usd: float


@router.get("/fuel-prices", response_model=FuelPricesResponse)
def get_fuel_prices():
    """
    Returns the current default fuel price per liter, in both LBP and
    USD (fixed conversion rate — see fuel_prices.LBP_PER_USD), for each
    fuel type (95_octane, 98_octane, diesel). Used to prefill the Trip
    Planner's user-overridable fuel price field. Cached weekly — see
    app/services/fuel_prices.py.
    """
    try:
        prices_lbp = get_current_fuel_prices()
    except FuelPriceError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return {
        "prices": {
            fuel_type: {
                "lbp_per_liter": price,
                "usd_per_liter": lbp_to_usd(price),
            }
            for fuel_type, price in prices_lbp.items()
        },
        "lbp_per_usd": LBP_PER_USD,
    }


# Traffic increases real-world fuel consumption beyond what distance
# alone implies (stop-and-go driving, idling, lower average speeds).
# There's no precise per-trip model for this without real vehicle
# telemetry, so this is a deliberately simple, capped heuristic (CAR-42):
# the current-traffic estimate's effective efficiency is reduced in
# proportion to how much slower the traffic-adjusted duration is than
# the no-traffic baseline, reaching this maximum penalty once traffic
# makes the trip twice as long as it would be with no traffic. 30% is
# roughly the commonly-cited city-vs-highway fuel economy gap — a
# reasonable ceiling so one severely congested route doesn't imply an
# absurd fuel penalty.
MAX_TRAFFIC_FUEL_PENALTY = 0.30


def _traffic_adjusted_efficiency(
    fuel_efficiency: float, duration_min: int, duration_in_traffic_min: int
) -> float:
    """
    Returns an effective km/L figure reduced for the current traffic
    conditions, capped at MAX_TRAFFIC_FUEL_PENALTY worse than the car's
    rated fuel_efficiency. No traffic slowdown (or Maps reporting an
    unusable duration_min) returns the rated efficiency unchanged.
    """
    if duration_min <= 0 or duration_in_traffic_min <= duration_min:
        return fuel_efficiency

    traffic_ratio = duration_in_traffic_min / duration_min
    penalty = min(MAX_TRAFFIC_FUEL_PENALTY, (traffic_ratio - 1.0) * MAX_TRAFFIC_FUEL_PENALTY)
    return fuel_efficiency / (1 + penalty)


def _price_bucket_for_car_fuel_type(car_fuel_type: str) -> str | None:
    """
    Maps a car's general fuel_type (from the Car Onboarding dropdown —
    Gasoline, Diesel, Hybrid, Electric, Other) onto one of the 3 grades
    fuel_prices.py actually tracks. Diesel maps directly; Electric has no
    liquid-fuel cost at all (returns None); everything else (Gasoline,
    Hybrid, Other) defaults to 95-octane, the common regular grade —
    there's no more specific octane-preference field to go on.
    """
    normalized = car_fuel_type.strip().lower()
    if normalized == "diesel":
        return "diesel"
    if normalized == "electric":
        return None
    return "95_octane"


class EstimateTripRequest(BaseModel):
    # RecordId (UUID): a malformed id is a clean 422, not a Postgres error.
    car_id: RecordId
    destination: PlaceText
    origin: PlaceText | None = None
    # Manual override for the fuel price, in LBP per liter. If omitted,
    # the current scraped/cached default for the car's fuel grade is used.
    # Positive, bounded, and never NaN/Infinity (CAR-23).
    fuel_price_per_liter_lbp: FuelPriceLbp | None = None


class EstimateTripResponse(BaseModel):
    id: str
    distance_km: float
    duration_min: int
    duration_in_traffic_min: int
    fuel_price_used_lbp: float
    # Light-traffic estimate: distance / the car's rated fuel_efficiency,
    # unchanged since before CAR-42 — this is what `trips.estimated_cost`
    # persists, same as always.
    estimated_cost_lbp: float
    estimated_cost_usd: float
    # CAR-42: the same trip, but with fuel efficiency reduced for current
    # traffic conditions (see _traffic_adjusted_efficiency) — response-only,
    # never persisted, since it changes every time someone re-checks.
    estimated_cost_current_traffic_lbp: float
    estimated_cost_current_traffic_usd: float
    # CAR-48: encoded overview polyline of the driving route (response-only,
    # not persisted) so the results map can draw the real route.
    route_polyline: str | None = None


@router.post("/estimate", response_model=EstimateTripResponse)
def post_estimate(
    payload: EstimateTripRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    The full Trip Planner flow: looks up the route via Google Maps,
    computes estimated fuel cost as
    (distance_km / car's fuel_efficiency) * fuel_price_per_liter,
    and saves the result as a new row in `trips`.

    Requires a valid Supabase session (Authorization: Bearer <jwt>) so
    the trip can be attributed to the right user, and so `car_id` can be
    checked against that user's own cars — the backend uses the service
    role key elsewhere, which bypasses RLS, so this check is done
    explicitly here rather than relied on implicitly.
    """
    if not payload.origin:
        raise HTTPException(
            status_code=400, detail="Origin is required to calculate a route."
        )

    car_result = (
        supabase.table("cars")
        .select("fuel_efficiency, fuel_type")
        .eq("id", str(payload.car_id))
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    # supabase-py's maybe_single().execute() returns None outright (not a
    # response object with .data = None) when nothing matches.
    car_data = car_result.data if car_result else None
    if not car_data:
        raise HTTPException(status_code=404, detail="Car not found.")

    fuel_efficiency = car_data.get("fuel_efficiency")
    if not fuel_efficiency or fuel_efficiency <= 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "This car doesn't have a fuel efficiency (km/L) set yet. "
                "Add it on the Car Profile page first."
            ),
        )

    if payload.fuel_price_per_liter_lbp is not None:
        fuel_price = payload.fuel_price_per_liter_lbp
    else:
        price_bucket = _price_bucket_for_car_fuel_type(
            car_data.get("fuel_type") or ""
        )
        if price_bucket is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Fuel cost estimation isn't available for electric "
                    "vehicles. Enter a fuel price manually if you'd like "
                    "an estimate anyway."
                ),
            )
        try:
            fuel_price = get_current_fuel_prices()[price_bucket]
        except FuelPriceError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error

    try:
        route = get_route_summary(payload.origin, payload.destination)
    except GoogleMapsError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    liters_needed = route["distance_km"] / fuel_efficiency
    estimated_cost_lbp = round(liters_needed * fuel_price, 0)

    effective_efficiency = _traffic_adjusted_efficiency(
        fuel_efficiency, route["duration_min"], route["duration_in_traffic_min"]
    )
    liters_needed_current_traffic = route["distance_km"] / effective_efficiency
    estimated_cost_current_traffic_lbp = round(
        liters_needed_current_traffic * fuel_price, 0
    )

    trip_row = {
        "user_id": user_id,
        "car_id": str(payload.car_id),
        "origin": payload.origin,
        "destination": payload.destination,
        "distance_km": route["distance_km"],
        "estimated_duration_min": route["duration_min"],
        "traffic_duration_min": route["duration_in_traffic_min"],
        "fuel_price_used": fuel_price,
        "estimated_cost": estimated_cost_lbp,
    }
    inserted = supabase.table("trips").insert(trip_row).execute()

    return {
        "id": inserted.data[0]["id"],
        "distance_km": route["distance_km"],
        "duration_min": route["duration_min"],
        "duration_in_traffic_min": route["duration_in_traffic_min"],
        "fuel_price_used_lbp": fuel_price,
        "estimated_cost_lbp": estimated_cost_lbp,
        "estimated_cost_usd": lbp_to_usd(estimated_cost_lbp),
        "estimated_cost_current_traffic_lbp": estimated_cost_current_traffic_lbp,
        "estimated_cost_current_traffic_usd": lbp_to_usd(
            estimated_cost_current_traffic_lbp
        ),
        "route_polyline": route.get("route_polyline"),
    }
