-- Run by hand by the developer in the Supabase SQL editor on 2026-10-24, so it is NOT in the project's migration
-- history (there is no version number). Verified afterwards with pg_constraint: cars_vin_format_check exists, NOT VALID.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- A VIN is either empty or exactly 17 letters and digits, never I, O or Q, in either case.
--
-- Why: a "<script>alert(1)</script>" string was saved as a VIN. The car forms now refuse a malformed VIN
-- (frontend/src/lib/limits.js, getVinError), but the browser writes cars straight to Supabase, so anything
-- calling the API directly could still store one. The only database rule so far is the length (32).
--
-- NOT VALID: the rule is enforced for every new row and every UPDATE of a row, but existing rows are not
-- scanned when it is added. Checked read-only before writing this: 6 cars, 3 with a VIN, all 3 are valid, none
-- are empty strings or lower case, so nothing is affected today. Note an UPDATE of a row whose VIN is already
-- malformed would be refused even if the VIN is not what changed, until the VIN is fixed or cleared.
-- (The forms store an empty VIN as null; '' is allowed too.)
--
-- Rollback (instant, no data change):
--   alter table public.cars drop constraint cars_vin_format_check;

alter table public.cars
  add constraint cars_vin_format_check
  check (vin is null or vin = '' or vin ~* '^[A-HJ-NPR-Z0-9]{17}$') not valid;
