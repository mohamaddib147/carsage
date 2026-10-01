-- Exported from the live Supabase project's migration history (version 20261001121725,
-- name create_car_photos_bucket) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'car-photos',
  'car-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
);
