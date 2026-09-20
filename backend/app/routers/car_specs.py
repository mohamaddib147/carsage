# GET /cars/spec-suggestions: best-effort autofill for Car Onboarding
# (CAR-34) — looks up make/model/year against NHTSA vPIC + API Ninjas +
# fueleconomy.gov (plus an auto-data.net lookup / AI estimate for tank capacity) and returns
# whatever specs are available. No auth required (it's a public
# data lookup, not a write), and never errors even if both lookups fail —
# callers should treat every field as optional and fall back to manual
# entry.

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.vehicle_lookup import get_spec_suggestions
from app.validation import MAX_CAR_YEAR, MAX_MAKE_MODEL_CHARS, MIN_CAR_YEAR

router = APIRouter(prefix="/cars", tags=["cars"])


class SpecSuggestionsResponse(BaseModel):
    vehicle_confirmed: bool
    engine_type: str | None
    fuel_efficiency: float | None
    cylinders: int | None
    drivetrain: str | None
    transmission: str | None
    fuel_tank_capacity_liters: float | None = None
    # Where the tank capacity came from: "api_ninjas", "auto_data" (spec
    # sheet lookup), "ai_estimate" (a guess, UI asks the user to verify), or
    # None when there is no tank value.
    fuel_tank_capacity_source: str | None = None


@router.get("/spec-suggestions", response_model=SpecSuggestionsResponse)
def get_spec_suggestions_endpoint(
    # CAR-23: bounded, non-blank (pattern needs at least one non-space
    # character) and a sane year — these values end up in outbound URLs.
    make: Annotated[str, Query(min_length=1, max_length=MAX_MAKE_MODEL_CHARS, pattern=r"\S")],
    model: Annotated[str, Query(min_length=1, max_length=MAX_MAKE_MODEL_CHARS, pattern=r"\S")],
    year: Annotated[int, Query(ge=MIN_CAR_YEAR, le=MAX_CAR_YEAR)],
):
    """
    Looks up autofill suggestions for a car's specs given make/model/year.
    Always returns 200 with best-effort data (fields None where unknown),
    since this is a convenience lookup a failed/absent match must never
    block Car Onboarding.
    """
    return get_spec_suggestions(make, model, year)
