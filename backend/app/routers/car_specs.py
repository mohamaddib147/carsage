# GET /cars/spec-suggestions: best-effort autofill for Car Onboarding
# (CAR-34) — looks up make/model/year against NHTSA vPIC + API Ninjas +
# fueleconomy.gov (plus an auto-data.net lookup / AI estimate for tank capacity) and returns
# whatever specs are available. Requires a logged-in caller (CAR-24: it
# was public, which let anyone burn the NHTSA / API Ninjas / LLM quotas and
# trigger the auto-data.net lookup), and never errors even if the lookups fail —
# callers should treat every field as optional and fall back to manual
# entry.
#
# POST /cars/scan-registration (CAR-57): a second, unrelated autofill path
# for the same form — reads a photographed registration card via Gemini
# vision (app/services/llm_client.py's extract_registration_fields) instead
# of an external vehicle-data API. Kept in this same router/file since both
# endpoints exist purely to fill in Car Onboarding's fields; unlike the
# spec-suggestions lookup, a scan failure IS surfaced to the caller (422),
# since there's no sensible "silent empty result" for "we couldn't read
# your photo" the way there is for "this trim isn't in NHTSA's database".

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.services.llm_client import LLMError, extract_registration_fields
from app.services.vehicle_lookup import get_spec_suggestions
from app.validation import (
    ALLOWED_REGISTRATION_IMAGE_TYPES,
    MAX_CAR_YEAR,
    MAX_MAKE_MODEL_CHARS,
    MAX_REGISTRATION_IMAGE_BYTES,
    MIN_CAR_YEAR,
)

# CAR-24: authentication is required for EVERY route on this router, declared
# once at the router level (`dependencies=[...]`) so an endpoint added later is
# protected by default instead of relying on someone remembering to add it.
# The caller's Supabase JWT is verified server-side (app/auth.py) before any
# handler — or request-body validation — runs. Only /health is public.
router = APIRouter(
    prefix="/cars",
    tags=["cars"],
    dependencies=[Depends(get_current_user_id)],
)


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


class ScanRegistrationResponse(BaseModel):
    readable: bool
    make: str | None
    model: str | None
    year: int | None
    vin: str | None
    license_plate: str | None


@router.post("/scan-registration", response_model=ScanRegistrationResponse)
async def scan_registration_endpoint(file: UploadFile = File(...)):
    """
    Reads a photographed vehicle registration card (CAR-57) and returns
    whatever of make/model/year/VIN/license plate could be extracted, for
    Car Onboarding to prefill. The image is read into memory for this one
    request and never persisted (not to Supabase, not to disk) — it goes
    out of scope as soon as this function returns.

    Unlike /spec-suggestions, a genuine failure here (an oversized/wrong-
    type file, or Gemini being unreachable) IS a 422 rather than a silent
    empty result, since there's a real difference between "we tried and
    your car isn't in a database" and "we couldn't even look at your
    photo" — the caller should tell the user to retry rather than treating
    it the same as an unreadable-but-real registration card.
    """
    if file.content_type not in ALLOWED_REGISTRATION_IMAGE_TYPES:
        raise HTTPException(status_code=422, detail="Please upload a JPEG, PNG, WEBP or HEIC photo.")

    image_bytes = await file.read()
    if len(image_bytes) > MAX_REGISTRATION_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="That image is too large. Please use a photo under 8 MB.")
    if not image_bytes:
        raise HTTPException(status_code=422, detail="That image appears to be empty. Please try again.")

    try:
        return extract_registration_fields(image_bytes, file.content_type)
    except LLMError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
