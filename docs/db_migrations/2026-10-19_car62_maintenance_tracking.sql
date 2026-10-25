-- Exported from the live Supabase project's migration history (version 20261019191933,
-- name car62_maintenance_tracking) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- CAR-62: maintenance tracking. Additive only: two new tables, nothing existing changes.

create table public.maintenance_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  name text not null,
  interval_km integer,
  interval_months integer,
  baseline_date date not null,
  baseline_km integer,
  notes text,
  created_at timestamptz not null default now(),
  constraint maintenance_items_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint maintenance_items_interval_km_range_check check (interval_km is null or interval_km between 100 and 200000),
  constraint maintenance_items_interval_months_range_check check (interval_months is null or interval_months between 1 and 120),
  constraint maintenance_items_has_interval_check check (interval_km is not null or interval_months is not null),
  constraint maintenance_items_baseline_date_range_check check (baseline_date between date '2000-01-01' and date '2100-12-31'),
  constraint maintenance_items_baseline_km_range_check check (baseline_km is null or baseline_km between 1 and 2000000),
  constraint maintenance_items_km_needs_baseline_check check (interval_km is null or baseline_km is not null),
  constraint maintenance_items_notes_length_check check (notes is null or char_length(notes) <= 500)
);

comment on table public.maintenance_items is
  'CAR-62: a recurring service item for one car. The schedule starts from the latest maintenance_records row, or from baseline_date/baseline_km (when it was last done before tracking) if there is none.';

create index maintenance_items_car_id_idx on public.maintenance_items (car_id);
create index maintenance_items_user_id_idx on public.maintenance_items (user_id);

alter table public.maintenance_items enable row level security;

create policy "Users can view their own maintenance items" on public.maintenance_items
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can add maintenance items to their own cars" on public.maintenance_items
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid())
  );

create policy "Users can edit their own maintenance items" on public.maintenance_items
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid())
  );

create policy "Users can delete their own maintenance items" on public.maintenance_items
  for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.maintenance_items from anon, authenticated;
grant select, insert, delete on public.maintenance_items to authenticated;
-- Edits may change only these columns: never the owner or the car.
grant update (name, interval_km, interval_months, baseline_date, baseline_km, notes)
  on public.maintenance_items to authenticated;


create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.maintenance_items(id) on delete cascade,
  done_on date not null,
  odometer_km integer,
  note text,
  created_at timestamptz not null default now(),
  constraint maintenance_records_done_on_range_check check (done_on between date '2000-01-01' and date '2100-12-31'),
  constraint maintenance_records_odometer_km_range_check check (odometer_km is null or odometer_km between 1 and 2000000),
  constraint maintenance_records_note_length_check check (note is null or char_length(note) <= 500)
);

comment on table public.maintenance_records is
  'CAR-62: history of each time a maintenance item was done. Rows are never edited (no UPDATE); the owner may delete one (an "Undo" of a mistaken completion). The latest row (by done_on, then created_at) is the item''s new baseline. Costs live in CAR-64, not here.';

create index maintenance_records_item_id_done_on_idx on public.maintenance_records (item_id, done_on desc);
create index maintenance_records_user_id_idx on public.maintenance_records (user_id);

alter table public.maintenance_records enable row level security;

create policy "Users can view their own maintenance records" on public.maintenance_records
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can record maintenance on their own items" on public.maintenance_records
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.maintenance_items i where i.id = item_id and i.user_id = auth.uid())
  );

create policy "Users can delete their own maintenance records" on public.maintenance_records
  for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.maintenance_records from anon, authenticated;
grant select, insert, delete on public.maintenance_records to authenticated;
