-- Exported from the live Supabase project's migration history (version 20260911081841,
-- name harden_handle_new_user) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- Pin the search_path so the function can't be tricked by a malicious schema,
-- and revoke public/authenticated execute since this must only run via the
-- auth trigger, never be callable directly as an RPC.
alter function public.handle_new_user() set search_path = public;

revoke execute on function public.handle_new_user() from anon, authenticated;
