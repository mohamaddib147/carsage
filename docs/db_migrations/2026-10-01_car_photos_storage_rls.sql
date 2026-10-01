-- Exported from the live Supabase project's migration history (version 20261001121736,
-- name car_photos_storage_rls) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
create policy "car_photos_select_own"
on storage.objects for select
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "car_photos_insert_own"
on storage.objects for insert
to authenticated
with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "car_photos_update_own"
on storage.objects for update
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "car_photos_delete_own"
on storage.objects for delete
to authenticated
using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);
