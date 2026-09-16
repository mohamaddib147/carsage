# Trip Planner endpoints: Google Maps route lookup (distance + duration)
# and the current default fuel price; fuel cost calculation using the
# car's fuel efficiency is a separate later task.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.fuel_prices import FuelPriceError, get_current_fuel_prices
from app.services.google_maps import GoogleMapsError, get_route_summary

router = APIRouter(prefix="/trip-planner", tags=["trip-planner"])


class DirectionsRequest(BaseModel):
    destination: str = Field(min_length=1)
    origin: str | None = Field(default=None, min_length=1)


class DirectionsResponse(BaseModel):
    distance_km: float
    duration_min: int
    duration_in_traffic_min: int


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


class FuelPricesResponse(BaseModel):
    prices_per_liter_lbp: dict[str, float]


@router.get("/fuel-prices", response_model=FuelPricesResponse)
def get_fuel_prices():
    """
    Returns the current default fuel price per liter (LBP) for each fuel
    type (95_octane, 98_octane, diesel), used to prefill the Trip
    Planner's user-overridable fuel price field. Cached weekly — see
    app/services/fuel_prices.py.
    """
    try:
        prices = get_current_fuel_prices()
    except FuelPriceError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return {"prices_per_liter_lbp": prices}
