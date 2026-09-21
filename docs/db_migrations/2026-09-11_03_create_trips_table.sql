-- Exported from the live Supabase project's migration history (version 20260911081713,
-- name create_trips_table) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  origin text,
  destination text not null,
  distance_km numeric,
  estimated_duration_min int,
  traffic_duration_min int,
  fuel_price_used numeric,
  estimated_cost numeric,
  created_at timestamptz not null default now()
);

create index trips_user_id_idx on public.trips(user_id);
create index trips_car_id_idx on public.trips(car_id);

alter table public.trips enable row level security;

create policy "Users can view their own trips"
  on public.trips for select
  using (auth.uid() = user_id);

create policy "Users can insert their own trips"
  on public.trips for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own trips"
  on public.trips for update
  using (auth.uid() = user_id);

create policy "Users can delete their own trips"
  on public.trips for delete
  using (auth.uid() = user_id);
