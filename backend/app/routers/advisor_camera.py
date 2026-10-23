# POST /ai-advisor/scan-photo: the Advisor's camera. Looks at ONE photo (a dashboard
# warning light, a lamp, a tire, the windshield, a fluid leak, or another visible car
# problem) through Gemini vision and returns what to show: a key from a FIXED list with
# our own sentence, a cleaned short description for "other", or a plain message
# (not a car, can't tell, or the photo shows people, a plate or a document). The
# frontend puts the sentence in the Advisor's input box for the user to edit; it is
# never sent automatically, and POST /ai-advisor/classify (with its NHTSA recall check)
# still decides DIY versus mechanic. All the rules about what may be shown live in
# app/services/photo_findings.py.
#
# The photo is read for this one request and never stored. It is the shared "camera"
# feature for usage limiting (the same daily allowance as the Fuel Log's scans). The cap
# is checked BEFORE the image is decoded or sent anywhere, so a refused request costs
# nothing, and a failure of the limit service refuses the scan too (fail closed). Every
# scan that reaches Google counts, including one refused as sensitive or not_car.

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.auth import get_current_user_id
from app.routers.fuel_camera import enforce_camera_usage, read_and_validate_upload
from app.services.image_validation import InvalidImage, validate_and_sanitize_image
from app.services.llm_client import LLMError, extract_photo_finding
from app.services.photo_findings import interpret_finding

router = APIRouter(
    prefix="/ai-advisor",
    tags=["ai-advisor"],
    dependencies=[Depends(get_current_user_id)],
)


class ScanPhotoResponse(BaseModel):
    # listed | other | not_car | unknown | sensitive
    kind: str
    # The listed key (kind "listed" only).
    key: str | None = None
    # The sentence for the input box (kinds "listed" and "other").
    sentence: str | None = None
    # A plain message to show instead (not_car, unknown, sensitive).
    message: str | None = None
    # low | medium | high (kinds "listed" and "other").
    confidence: str | None = None


@router.post("/scan-photo", response_model=ScanPhotoResponse)
async def scan_photo_endpoint(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Names what is visibly wrong in a photo of a car part (see the module comment)."""
    image_bytes = await read_and_validate_upload(file)
    enforce_camera_usage(user_id)

    try:
        sanitized_bytes, mime_type = validate_and_sanitize_image(image_bytes)
    except InvalidImage as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    try:
        parsed = extract_photo_finding(sanitized_bytes, mime_type)
    except LLMError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return interpret_finding(parsed)
