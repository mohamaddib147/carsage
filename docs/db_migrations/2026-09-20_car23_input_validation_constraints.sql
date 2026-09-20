-- CAR-23: server-side input validation for every column the app writes.
-- Applied to the live Supabase project (ehjvbkhoafldqfsivtrn) via the MCP
-- connector. Kept here as an audit trail only — the live schema is the source
-- of truth (docs/CarSage_ERD.pdf is a frozen snapshot and is not updated).
--
-- Why: the browser writes `cars` straight to Supabase under RLS, and RLS only
-- controls WHO may write, not WHAT. Before this migration the database accepted
-- 1 MB text values, year -5, `<script>` as a fuel type, negative fuel
-- efficiency, etc. from any logged-in user who bypassed the UI. These limits
-- mirror the frontend (src/lib/limits.js) and backend (app/validation.py).
--
-- To undo one: ALTER TABLE <table> DROP CONSTRAINT <name>;

-- ---- cars -----------------------------------------------------------------
alter table public.cars
  add constraint cars_make_len_check check (char_length(btrim(make)) between 1 and 60),
  add constraint cars_model_len_check check (char_length(btrim(model)) between 1 and 60),
  add constraint cars_year_range_check check (year between 1900 and 2100),
  add constraint cars_fuel_type_check check (fuel_type is null or fuel_type in ('Gasoline', 'Diesel', 'Hybrid', 'Electric', 'Other')),
  add constraint cars_engine_type_len_check check (engine_type is null or char_length(engine_type) <= 60),
  add constraint cars_drivetrain_len_check check (drivetrain is null or char_length(drivetrain) <= 60),
  add constraint cars_transmission_len_check check (transmission is null or char_length(transmission) <= 60),
  add constraint cars_license_plate_len_check check (license_plate is null or char_length(license_plate) <= 20),
  add constraint cars_vin_len_check check (vin is null or char_length(vin) <= 32),
  add constraint cars_fuel_efficiency_range_check check (fuel_efficiency is null or (fuel_efficiency > 0 and fuel_efficiency <= 100)),
  add constraint cars_cylinders_range_check check (cylinders is null or cylinders between 1 and 16);

-- ---- trips (written by the backend, but users may also insert under RLS) ---
alter table public.trips
  add constraint trips_origin_len_check check (origin is null or char_length(origin) <= 300),
  add constraint trips_destination_len_check check (char_length(btrim(destination)) between 1 and 300),
  add constraint trips_distance_range_check check (distance_km is null or (distance_km >= 0 and distance_km <= 20000)),
  add constraint trips_duration_range_check check (estimated_duration_min is null or estimated_duration_min between 0 and 20000),
  add constraint trips_traffic_duration_range_check check (traffic_duration_min is null or traffic_duration_min between 0 and 20000),
  add constraint trips_fuel_price_range_check check (fuel_price_used is null or (fuel_price_used > 0 and fuel_price_used <= 10000000)),
  add constraint trips_estimated_cost_range_check check (estimated_cost is null or (estimated_cost >= 0 and estimated_cost <= 1000000000000));

-- ---- advisor_messages ------------------------------------------------------
alter table public.advisor_messages
  add constraint advisor_messages_text_len_check check (char_length(btrim(message_text)) between 1 and 8000),
  add constraint advisor_messages_video_title_len_check check (video_title is null or char_length(video_title) <= 300),
  -- Only real YouTube watch links: the frontend renders this as an <a href>,
  -- so this also rules out a `javascript:` URL being stored.
  add constraint advisor_messages_video_url_check check (video_url is null or (char_length(video_url) <= 300 and video_url like 'https://www.youtube.com/watch?v=%'));

-- ---- profiles --------------------------------------------------------------
alter table public.profiles
  add constraint profiles_full_name_len_check check (full_name is null or char_length(full_name) <= 100),
  add constraint profiles_email_len_check check (char_length(email) <= 320);

-- ---- required-ness ----------------------------------------------------------
-- The Car Onboarding form requires a fuel type; the database now does too.
-- (Applied as a second migration: car23_cars_fuel_type_not_null.)
alter table public.cars alter column fuel_type set not null;
