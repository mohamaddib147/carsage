# Best-effort YouTube DIY video lookup for AI Advisor (CAR-40): searches
# YouTube Data API v3 for a tutorial matching the car + issue, used only
# when the recommendation is 'diy' (mechanic recommendations don't need
# a video, conserving quota). Isolated in one function so a failure,
# quota exhaustion, or no-key-configured case can never break or block
# the classification response it's attached to.

import httpx

from app.config import YOUTUBE_API_KEY

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"

# Keep the query focused — a long full issue description dilutes search
# relevance more than it helps.
MAX_DESCRIPTION_CHARS = 100


def _build_query(car_context: dict, description: str) -> str:
    """Builds a search query from the car's year/make/model plus the
    issue description, e.g. "2005 Mercedes-Benz C230 squeaking brakes
    when cold fix"."""
    car_line = " ".join(
        str(value)
        for value in (
            car_context.get("year"),
            car_context.get("make"),
            car_context.get("model"),
        )
        if value
    )
    issue = description.strip()[:MAX_DESCRIPTION_CHARS]
    return f"{car_line} {issue} fix".strip()


def search_diy_video(car_context: dict, description: str) -> dict | None:
    """
    Searches YouTube for a DIY tutorial video matching the car and issue.

    Args:
        car_context: A dict with any of "make", "model", "year".
        description: The owner's issue description.

    Returns:
        {"video_title": str, "video_url": str} for the top result, or
        None if YOUTUBE_API_KEY isn't configured, the API call fails or
        hits its quota, or there's no result — never raises, since a
        missing video must never block or break the AI Advisor response.
    """
    if not YOUTUBE_API_KEY:
        return None

    try:
        response = httpx.get(
            YOUTUBE_SEARCH_URL,
            params={
                "part": "snippet",
                "q": _build_query(car_context, description),
                "type": "video",
                "maxResults": 1,
                "safeSearch": "strict",
                "key": YOUTUBE_API_KEY,
            },
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        # ValueError: a 200 whose body isn't JSON (e.g. an HTML error page).
        return None

    try:
        top_result = data["items"][0]
        video_id = top_result["id"]["videoId"]
        title = top_result["snippet"]["title"]
    except (KeyError, IndexError, TypeError):
        # No results, or a response shape we don't recognize.
        return None
    if not video_id or not title:
        return None

    return {
        "video_title": title,
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
    }
