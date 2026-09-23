# Configures the single Supabase client used by the backend. This uses the
# service role key, which bypasses Row Level Security — it must only ever
# be used server-side, never sent to the frontend.

from supabase import Client, create_client

from app.config import SUPABASE_SERVICE_KEY, SUPABASE_URL

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
