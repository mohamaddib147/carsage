-- Exported from the live Supabase project's migration history (version 20260911081704,
-- name create_cars_table) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
create table public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year int not null,
  engine_type text,
  fuel_type text,
  fuel_efficiency numeric,
  license_plate text,
  vin text,
  created_at timestamptz not null default now()
);

create index cars_user_id_idx on public.cars(user_id);

alter table public.cars enable row level security;

create policy "Users can view their own cars"
  on public.cars for select
  using (auth.uid() = user_id);

create policy "Users can insert their own cars"
  on public.cars for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own cars"
  on public.cars for update
  using (auth.uid() = user_id);

create policy "Users can delete their own cars"
  on public.cars for delete
  using (auth.uid() = user_id);
