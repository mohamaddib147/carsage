// Configures the single Supabase client instance used throughout the
// frontend. The anon key is safe to expose in client code — RLS on every
// table enforces per-user access, so this key alone can't read/write
// another user's data.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy frontend/.env.example to frontend/.env and fill in the values.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
