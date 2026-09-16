# Health-check endpoint — confirms the API is up and can reach the
# Supabase Postgres database via the service key.

from fastapi import APIRouter

from app.supabase_client import supabase

router = APIRouter()


@router.get("/health")
def get_health():
    """
    Reports whether the API is running and whether it can reach the
    database. Never surfaces the underlying error detail to the client —
    only a generic status — to avoid leaking connection info.
    """
    db_status = "connected"
    try:
        supabase.table("profiles").select("id").limit(1).execute()
    except Exception:
        db_status = "unreachable"

    return {"status": "ok", "database": db_status}
