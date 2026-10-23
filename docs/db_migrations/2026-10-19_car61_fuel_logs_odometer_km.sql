-- Exported from the live Supabase project's migration history (version 20261019180028,
-- name car61_fuel_logs_odometer_km) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- CAR-61: optional odometer reading (km) on each fill-up. Additive only.
alter table public.fuel_logs
  add column odometer_km integer;

alter table public.fuel_logs
  add constraint fuel_logs_odometer_km_range_check
  check (odometer_km is null or (odometer_km > 0 and odometer_km <= 2000000));

comment on column public.fuel_logs.odometer_km is
  'Odometer reading in km at this fill-up (optional, null on older rows). Real km/L assumes each fill-up fills the tank to full.';
