# GET /cars/spec-suggestions: best-effort autofill for Car Onboarding
# (CAR-34) — looks up make/model/year against NHTSA vPIC + API Ninjas and
# returns whatever specs are available. No auth required (it's a public
# data lookup, not a write), and never errors even if both lookups fail —
# callers should treat every field as optional and fall back to manual
# entry.

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.vehicle_lookup import get_spec_suggestions

router = APIRouter(prefix="/cars", tags=["cars"])


class SpecSuggestionsResponse(BaseModel):
    vehicle_confirmed: bool
    engine_type: str | None
    fuel_efficiency: float | None
    cylinders: int | None
    drivetrain: str | None
    transmission: str | None
    fuel_tank_capacity_liters: float | None = None


@router.get("/spec-suggestions", response_model=SpecSuggestionsResponse)
def get_spec_suggestions_endpoint(
    make: str = Query(min_length=1),
    model: str = Query(min_length=1),
    year: int = Query(),
):
    """
    Looks up autofill suggestions for a car's specs given make/model/year.
    Always returns 200 with best-effort data (fields None where unknown),
    since this is a convenience lookup a failed/absent match must never
    block Car Onboarding.
    """
    return get_spec_suggestions(make, model, year)
