# POST /fuel-log/scan-pump and POST /fuel-log/scan-odometer (Step 2, no
# Jira task yet): read a photo of a fuel pump's display or a car's
# odometer via Gemini vision (app/services/llm_client.py) to prefill the
# Fuel Log form. Same "the image is read for this one request and never
# persisted" contract throughout.
#
# Both endpoints are the "camera" feature for AI-usage limiting
# (app/services/usage_limiter.py, enforced by a database trigger on
# api_usage/api_usage_global) — a pump scan and an odometer scan draw from
# the same shared daily allowance. Per the feature's fail-closed policy:
# the limit genuinely being hit (UsageLimitExceeded) is a 429 either way;
# the usage table/trigger itself failing for any OTHER reason
# (UsageCheckFailed) is also refused (503) rather than letting an
# unmetered Gemini call through.
#
# The uploaded bytes go through app/services/image_validation.py before
# ever reaching Gemini: it re-decodes the file (catching a lying
# Content-Type), rejects anything animated or decompression-bomb-sized,
# and returns freshly re-encoded bytes with EXIF/metadata stripped.

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.services.image_validation import InvalidImage, validate_and_sanitize_image
from app.services.llm_client import (
    CAMERA_SCAN_FAILURE_MESSAGE,
    LLMError,
    extract_odometer_fields,
    extract_pump_fields,
)
from app.services.usage_limiter import UsageCheckFailed, UsageLimitExceeded, enforce_usage
from app.validation import ALLOWED_FUEL_PHOTO_TYPES, MAX_FUEL_PHOTO_BYTES

logger = logging.getLogger(__name__)

CAMERA_FEATURE = "camera"

router = APIRouter(
    prefix="/fuel-log",
    tags=["fuel-log"],
    dependencies=[Depends(get_current_user_id)],
)


async def _read_and_validate_upload(file: UploadFile) -> bytes:
    """Shared size/type pre-check for both endpoints (422s before any
    usage is counted or any work happens), returning the raw bytes."""
    if file.content_type not in ALLOWED_FUEL_PHOTO_TYPES:
        raise HTTPException(status_code=422, detail="Please upload a JPEG, PNG or WEBP photo.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=422, detail="That image appears to be empty. Please try again.")
    if len(image_bytes) > MAX_FUEL_PHOTO_BYTES:
        raise HTTPException(status_code=422, detail="That image is too large. Please use a photo under 8 MB.")
    return image_bytes


def _enforce_camera_usage(user_id: str) -> None:
    """Fail-closed camera usage check, shared by both endpoints: a
    genuine limit hit, or any failure of the limiting mechanism itself,
    both refuse the request rather than letting it through unmetered."""
    try:
        enforce_usage(user_id, CAMERA_FEATURE)
    except UsageLimitExceeded as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    except UsageCheckFailed as error:
        logger.exception("Camera usage-limit check failed: %s", error)
        raise HTTPException(status_code=503, detail=CAMERA_SCAN_FAILURE_MESSAGE) from error


class ScanPumpResponse(BaseModel):
    readable: bool
    liters: float | None
    total_price: float | None
    currency: str | None


@router.post("/scan-pump", response_model=ScanPumpResponse)
async def scan_pump_endpoint(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Reads a photo of a fuel pump's display and returns whatever of
    liters/total_price/currency could be extracted, for the Fuel Log form
    to prefill (never auto-saved — the user still reviews and submits)."""
    image_bytes = await _read_and_validate_upload(file)
    _enforce_camera_usage(user_id)

    try:
        sanitized_bytes, mime_type = validate_and_sanitize_image(image_bytes)
    except InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        return extract_pump_fields(sanitized_bytes, mime_type)
    except LLMError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


class ScanOdometerResponse(BaseModel):
    readable: bool
    odometer_km: int | None


@router.post("/scan-odometer", response_model=ScanOdometerResponse)
async def scan_odometer_endpoint(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Reads a photo of a car's odometer display and returns the reading
    if it could be extracted, for the Fuel Log form to prefill (never
    auto-saved)."""
    image_bytes = await _read_and_validate_upload(file)
    _enforce_camera_usage(user_id)

    try:
        sanitized_bytes, mime_type = validate_and_sanitize_image(image_bytes)
    except InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        return extract_odometer_fields(sanitized_bytes, mime_type)
    except LLMError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
