-- Exported from the live Supabase project's migration history (version 20260919150933,
-- name add_cars_fuel_tank_capacity_liters) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
ALTER TABLE public.cars
  ADD COLUMN fuel_tank_capacity_liters numeric
  CHECK (fuel_tank_capacity_liters IS NULL OR fuel_tank_capacity_liters > 0);
