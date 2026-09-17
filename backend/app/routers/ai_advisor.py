# POST /ai-advisor/classify: takes a car issue description + car_id and
# returns a DIY-vs-mechanic recommendation with short guidance, via the
# LLM classification isolated in app.services.llm_client (CAR-19).
# Requires auth so car_id can be checked against the caller's own cars —
# the backend's service-role client bypasses RLS, so this is checked
# explicitly here, same as the Trip Planner estimate endpoint.

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.services.llm_client import LLMError, classify_issue
from app.supabase_client import supabase

router = APIRouter(prefix="/ai-advisor", tags=["ai-advisor"])


class ClassifyIssueRequest(BaseModel):
    car_id: str
    description: str = Field(min_length=1)


class ClassifyIssueResponse(BaseModel):
    recommendation: str
    guidance: str


@router.post("/classify", response_model=ClassifyIssueResponse)
def post_classify_issue(
    payload: ClassifyIssueRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Classifies a described car issue as DIY-fixable or needing a
    mechanic, using the caller's own car (verified via car_id) as
    context for the LLM prompt.
    """
    car_result = (
        supabase.table("cars")
        .select("make, model, year")
        .eq("id", payload.car_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    # supabase-py's maybe_single().execute() returns None outright (not a
    # response object with .data = None) when nothing matches.
    car_data = car_result.data if car_result else None
    if not car_data:
        raise HTTPException(status_code=404, detail="Car not found.")

    try:
        return classify_issue(payload.description, car_data)
    except LLMError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
