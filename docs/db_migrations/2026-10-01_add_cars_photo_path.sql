-- Exported from the live Supabase project's migration history (version 20261001121718,
-- name add_cars_photo_path) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
ALTER TABLE public.cars ADD COLUMN photo_path text;
