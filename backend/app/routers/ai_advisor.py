# POST /ai-advisor/classify: takes a car issue description + car_id and
# returns a DIY-vs-mechanic recommendation with short guidance. Before
# falling back to the LLM classification (app.services.llm_client,
# CAR-19), checks NHTSA's official Recalls/Complaints data for a match
# (app.services.nhtsa_safety, CAR-36) — a matching open recall or a
# complaint pattern skips the LLM entirely and forces 'mechanic' with an
# NHTSA-grounded explanation (avoids the LLM's from-scratch guidance
# text contradicting a forced override); no match, or the NHTSA APIs
# being unreachable, proceeds with the normal LLM path unchanged; a
# vehicle NHTSA doesn't recognize at all gets an explicit disclaimer
# appended rather than being silently treated as "no match" (NHTSA is
# US-market only). Persists the exchange to advisor_conversations/
# advisor_messages (CAR-21) — a new conversation is created the first
# time a caller omits conversation_id, and subsequent messages pass it
# back to append to the same conversation. On a 'diy' recommendation,
# also looks up a matching YouTube tutorial (CAR-40) and saves it onto
# the AI's message row — a 'mechanic' recommendation (including one
# forced by an NHTSA match) never triggers this lookup, conserving quota
# per that task's AC. The description is validated before anything else
# (CAR-22): it must contain real words (not blank or only symbols) and stay
# under MAX_DESCRIPTION_CHARS, so junk or huge input never reaches NHTSA, the
# LLM or the database. Requires auth so car_id/conversation_id can be
# checked against the caller's own rows — the backend's service-role
# client bypasses RLS, so this is checked explicitly here, same as the
# Trip Planner estimate endpoint. Reading past conversation history is
# done by the frontend directly against Supabase (RLS-protected, like
# the Dashboard's car list), so there's no GET endpoint here.

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.services.llm_client import LLMError, classify_issue
from app.services.nhtsa_safety import check_safety_data
from app.services.youtube_client import search_diy_video
from app.supabase_client import supabase
from app.validation import (
    MAX_DESCRIPTION_CHARS,
    MAX_MESSAGE_TEXT_CHARS,
    RecordId,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-advisor", tags=["ai-advisor"])

# CAR-22: a car-issue description is a sentence or two. The cap
# (MAX_DESCRIPTION_CHARS, app/validation.py) keeps huge input out of the LLM
# prompt, NHTSA matching and the database; the letter minimum rejects blank /
# symbol-only input (unicode-aware, so Arabic works).
MIN_DESCRIPTION_LETTERS = 3


class ClassifyIssueRequest(BaseModel):
    # Ids are typed as UUIDs (CAR-23): a malformed id is a clean 422 instead
    # of reaching Postgres and crashing with a 500.
    car_id: RecordId
    description: str = Field(min_length=1)
    # Omit to start a new conversation; pass back a prior response's
    # conversation_id to append to that same conversation instead.
    conversation_id: RecordId | None = None


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
    description = payload.description.strip()
    if sum(char.isalpha() for char in description) < MIN_DESCRIPTION_LETTERS:
        raise HTTPException(
            status_code=422,
            detail="Please describe the problem in a few words.",
        )
    if len(description) > MAX_DESCRIPTION_CHARS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Please keep your description under {MAX_DESCRIPTION_CHARS} "
                "characters."
            ),
        )

    car_result = (
        supabase.table("cars")
        .select("make, model, year")
        .eq("id", str(payload.car_id))
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    car_data = car_result.data if car_result else None
    if not car_data:
        raise HTTPException(status_code=404, detail="Car not found.")

    conversation_id = _get_or_create_conversation(
        user_id,
        str(payload.car_id),
        str(payload.conversation_id) if payload.conversation_id else None,
    )

    supabase.table("advisor_messages").insert(
        {
            "conversation_id": conversation_id,
            "sender": "user",
            "message_text": description,
        }
    ).execute()

    safety = check_safety_data(
        car_data.get("make", ""),
        car_data.get("model", ""),
        car_data.get("year"),
        description,
    )

    if safety["status"] == "recall_match":
        result = {
            "recommendation": "mechanic",
            "guidance": (
                "NHTSA has an open recall on your vehicle involving the "
                f"same system as this issue ({safety.get('system', 'affected')}): "
                f"{safety['summary']} Given this official recall, please have "
                "a professional mechanic inspect this rather than attempting "
                "a DIY fix."
            ),
        }
    elif safety["status"] == "complaint_pattern":
        result = {
            "recommendation": "mechanic",
            "guidance": (
                f"NHTSA has received {safety['count']} similar owner "
                "complaints about this exact issue on this vehicle. Given "
                "this pattern, please have a professional mechanic inspect "
                "this rather than attempting a DIY fix."
            ),
        }
    else:
        try:
            result = classify_issue(description, car_data)
        except LLMError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error

        if safety["status"] == "not_found":
            result["guidance"] += (
                " (Note: NHTSA safety data isn't available for this vehicle "
                "— it may not be sold in the US market, or isn't in NHTSA's "
                "database.)"
            )

    ai_message = (
        supabase.table("advisor_messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "sender": "ai",
                # Capped to the database limit so a very long reply can never make the save fail.
            "message_text": result["guidance"][:MAX_MESSAGE_TEXT_CHARS],
                "recommendation": result["recommendation"],
            }
        )
        .execute()
    )

    # The video is a nice-to-have on top of an answer that is already saved:
    # nothing about looking it up or saving it may break the response.
    video = None
    if result["recommendation"] == "diy":
        try:
            video = search_diy_video(car_data, description)
        except Exception:  # noqa: BLE001 - see comment above
            logger.exception("YouTube video lookup failed unexpectedly")
        if video:
            try:
                supabase.table("advisor_messages").update(video).eq(
                    "id", ai_message.data[0]["id"]
                ).execute()
            except Exception:  # noqa: BLE001 - still show the video we found
                logger.exception("Could not save the video onto the AI message")

    return {
        "conversation_id": conversation_id,
        "recommendation": result["recommendation"],
        "guidance": result["guidance"],
        "video_title": video["video_title"] if video else None,
        "video_url": video["video_url"] if video else None,
    }
