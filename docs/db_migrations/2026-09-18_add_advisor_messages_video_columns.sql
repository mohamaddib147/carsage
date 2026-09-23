-- Exported from the live Supabase project's migration history (version 20260918065121,
-- name add_advisor_messages_video_columns) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
ALTER TABLE public.advisor_messages
  ADD COLUMN video_url text,
  ADD COLUMN video_title text;
