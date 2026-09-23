-- Exported from the live Supabase project's migration history (version 20260919165109,
-- name cars_fuel_tank_capacity_range_check) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
alter table public.cars drop constraint if exists cars_fuel_tank_capacity_liters_check;
alter table public.cars add constraint cars_fuel_tank_capacity_liters_check check (fuel_tank_capacity_liters is null or (fuel_tank_capacity_liters >= 5 and fuel_tank_capacity_liters <= 200));
