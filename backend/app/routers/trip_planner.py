# Trip Planner endpoints. For now, just the Google Maps route lookup
# (distance + duration); fuel cost calculation using the car's fuel
# efficiency is a separate later task.

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

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
