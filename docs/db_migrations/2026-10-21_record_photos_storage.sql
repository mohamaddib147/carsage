-- Exported from the live Supabase project's migration history (version 20261020211714,
-- name record_photos_storage) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim. (Applied just after
-- midnight Beirut time on 2026-10-21, which is 2026-10-20 in UTC, hence the version.)
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- 1. Private bucket: 2 MB, JPEG only (the browser re-encodes every photo to JPEG ~1600 px)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-photos', 'record-photos', false, 2097152, array['image/jpeg']);

-- 2. Maintenance completion photos: max 3 per completion, insert/delete only
create table public.maintenance_record_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  record_id uuid not null references public.maintenance_records(id) on delete cascade,
  slot smallint not null,
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint maintenance_record_photos_slot_check check (slot between 1 and 3),
  constraint maintenance_record_photos_one_per_slot unique (record_id, slot)
);
alter table public.maintenance_record_photos enable row level security;
revoke all on public.maintenance_record_photos from anon, authenticated;
grant select, insert, delete on public.maintenance_record_photos to authenticated;

-- 3. Expense receipt: at most one per expense, insert/delete only
create table public.car_expense_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expense_id uuid not null unique references public.car_expenses(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.car_expense_receipts enable row level security;
revoke all on public.car_expense_receipts from anon, authenticated;
grant select, insert, delete on public.car_expense_receipts to authenticated;

create policy "Users can view their own maintenance photos" on public.maintenance_record_photos
  for select to authenticated using (user_id = auth.uid());
create policy "Users can add photos to their own completions" on public.maintenance_record_photos
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.maintenance_records r where r.id = record_id and r.user_id = auth.uid())
    and storage_path = auth.uid()::text || '/maintenance/' || record_id::text || '/' || id::text || '.jpg'
    and (select count(*) from public.maintenance_record_photos p where p.user_id = auth.uid())
      + (select count(*) from public.car_expense_receipts e where e.user_id = auth.uid()) < 100);
create policy "Users can delete their own maintenance photos" on public.maintenance_record_photos
  for delete to authenticated using (user_id = auth.uid());

create policy "Users can view their own receipts" on public.car_expense_receipts
  for select to authenticated using (user_id = auth.uid());
create policy "Users can add a receipt to their own expense" on public.car_expense_receipts
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.car_expenses e where e.id = expense_id and e.user_id = auth.uid())
    and storage_path = auth.uid()::text || '/receipts/' || expense_id::text || '/' || id::text || '.jpg'
    and (select count(*) from public.maintenance_record_photos p where p.user_id = auth.uid())
      + (select count(*) from public.car_expense_receipts e where e.user_id = auth.uid()) < 100);
create policy "Users can delete their own receipts" on public.car_expense_receipts
  for delete to authenticated using (user_id = auth.uid());

-- 4. Storage policies (no UPDATE policy: a file can never be overwritten)
create policy "record_photos_select_own" on storage.objects for select to authenticated
using (bucket_id = 'record-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "record_photos_insert_own_with_row" on storage.objects for insert to authenticated
with check (bucket_id = 'record-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (exists (select 1 from public.maintenance_record_photos p where p.storage_path = name and p.user_id = auth.uid())
    or exists (select 1 from public.car_expense_receipts r where r.storage_path = name and r.user_id = auth.uid())));

create policy "record_photos_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'record-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 5. Cleanup queue (catches cascades: undoing a completion, deleting an item, a car or the account)
create table public.storage_cleanup_queue (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  queued_at timestamptz not null default now()
);
alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from anon, authenticated;

create or replace function public.queue_record_photo_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.storage_cleanup_queue (bucket_id, object_path) values ('record-photos', old.storage_path);
  return old;
end; $$;
revoke execute on function public.queue_record_photo_cleanup() from public, anon, authenticated;

create trigger maintenance_record_photos_queue_cleanup after delete on public.maintenance_record_photos
  for each row execute function public.queue_record_photo_cleanup();
create trigger car_expense_receipts_queue_cleanup after delete on public.car_expense_receipts
  for each row execute function public.queue_record_photo_cleanup();
