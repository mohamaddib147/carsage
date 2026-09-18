# POST /ai-advisor/classify: takes a car issue description + car_id and
# returns a DIY-vs-mechanic recommendation with short guidance, via the
# LLM classification isolated in app.services.llm_client (CAR-19), and
# persists the exchange to advisor_conversations/advisor_messages
# (CAR-21) — a new conversation is created the first time a caller omits
# conversation_id, and subsequent messages pass it back to append to the
# same conversation. On a 'diy' recommendation, also looks up a matching
# YouTube tutorial (CAR-40) and saves it onto the AI's message row — a
# 'mechanic' recommendation never triggers this lookup, conserving quota
# per that task's AC. Requires auth so car_id/conversation_id can be
# checked against the caller's own rows — the backend's service-role
# client bypasses RLS, so this is checked explicitly here, same as the
# Trip Planner estimate endpoint. Reading past conversation history is
# done by the frontend directly against Supabase (RLS-protected, like
# the Dashboard's car list), so there's no GET endpoint here.

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.services.llm_client import LLMError, classify_issue
from app.services.youtube_client import search_diy_video
from app.supabase_client import supabase

router = APIRouter(prefix="/ai-advisor", tags=["ai-advisor"])


class ClassifyIssueRequest(BaseModel):
    car_id: str
    description: str = Field(min_length=1)
    # Omit to start a new conversation; pass back a prior response's
    # conversation_id to append to that same conversation instead.
    conversation_id: str | None = None


class ClassifyIssueResponse(BaseModel):
    conversation_id: str
    recommendation: str
    guidance: str
    video_title: str | None = None
    video_url: str | None = None


def _get_or_create_conversation(
    user_id: str, car_id: str, conversation_id: str | None
) -> str:
    """
    Returns an existing conversation's id after confirming it belongs to
    the caller, or creates a new advisor_conversations row and returns
    its id.

    Raises:
        HTTPException(404): if conversation_id was given but doesn't
            belong to (or doesn't match) the caller — never lets a
            guessed id append messages into someone else's conversation.
    """
    if conversation_id:
        result = (
            supabase.table("advisor_conversations")
            .select("id")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        # supabase-py's maybe_single().execute() returns None outright
        # (not a response object with .data=None) when nothing matches.
        data = result.data if result else None
        if not data:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        return conversation_id

    inserted = (
        supabase.table("advisor_conversations")
        .insert({"user_id": user_id, "car_id": car_id})
        .execute()
    )
    return inserted.data[0]["id"]


@router.post("/classify", response_model=ClassifyIssueResponse)
def post_classify_issue(
    payload: ClassifyIssueRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Classifies a described car issue as DIY-fixable or needing a
    mechanic, using the caller's own car (verified via car_id) as
    context for the LLM prompt. Saves the user's message immediately,
    then the AI's reply once classification succeeds — if classification
    fails, the user's message is still on record but gets no AI reply
    row, same as a real chat where a send succeeded but the reply didn't.
    """
    car_result = (
        supabase.table("cars")
        .select("make, model, year")
        .eq("id", payload.car_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    car_data = car_result.data if car_result else None
    if not car_data:
        raise HTTPException(status_code=404, detail="Car not found.")

    conversation_id = _get_or_create_conversation(
        user_id, payload.car_id, payload.conversation_id
    )

    supabase.table("advisor_messages").insert(
        {
            "conversation_id": conversation_id,
            "sender": "user",
            "message_text": payload.description,
        }
    ).execute()

    try:
        result = classify_issue(payload.description, car_data)
    except LLMError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    ai_message = (
        supabase.table("advisor_messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "sender": "ai",
                "message_text": result["guidance"],
                "recommendation": result["recommendation"],
            }
        )
        .execute()
    )

    video = None
    if result["recommendation"] == "diy":
        video = search_diy_video(car_data, payload.description)
        if video:
            supabase.table("advisor_messages").update(video).eq(
                "id", ai_message.data[0]["id"]
            ).execute()

    return {
        "conversation_id": conversation_id,
        "recommendation": result["recommendation"],
        "guidance": result["guidance"],
        "video_title": video["video_title"] if video else None,
        "video_url": video["video_url"] if video else None,
    }
