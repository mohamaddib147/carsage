-- Exported from the live Supabase project's migration history (version 20260917064829,
-- name add_car_spec_autofill_columns) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
ALTER TABLE public.cars
  ADD COLUMN cylinders integer,
  ADD COLUMN drivetrain text,
  ADD COLUMN transmission text;
