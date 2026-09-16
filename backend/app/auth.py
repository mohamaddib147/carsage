# Verifies the Supabase JWT the frontend sends on requests that need to
# know which user is calling (e.g. saving a trip). The backend uses the
# service role key elsewhere, which bypasses RLS entirely, so any
# endpoint that reads/writes user-scoped data must independently confirm
# who the caller is — this is that check.

from fastapi import Header, HTTPException

from app.supabase_client import supabase


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    """
    FastAPI dependency: validates the `Authorization: Bearer <jwt>` header
    against Supabase Auth and returns the caller's user id.

    Raises:
        HTTPException(401): if the header is missing or the token is
            invalid/expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header.",
        )

    token = authorization.removeprefix("Bearer ").strip()
    try:
        user_response = supabase.auth.get_user(token)
    except Exception as error:
        raise HTTPException(
            status_code=401, detail="Invalid or expired session."
        ) from error

    if not user_response or not user_response.user:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return user_response.user.id
