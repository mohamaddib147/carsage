-- CAR-53: fuel fill-up log — one row each time a user fills a car's tank.
-- Applied to the live Supabase project (version recorded as car53_fuel_logs) via the MCP
-- connector; kept here so the database can be recreated from this repo. Everything below
-- the line is the migration's SQL, verbatim. Apply the files in filename order.
--
-- Design notes:
--  * cost_amount is stored EXACTLY as the user typed it, with cost_currency ('USD' or 'LBP'),
--    so a fill-up of $30 stays $30 if the app's conversion rate changes later.
--  * The CHECK constraints are the real server-side validation for the browser's direct
--    writes (row-level security controls WHO may write, not WHAT): a fill-up is 0-200 L
--    (the same ceiling as cars.fuel_tank_capacity_liters), a positive cost, a sane date.
--  * Insert policy: the row must be the caller's AND the car must be the caller's own
--    (the cross-user car_id gap CAR-24 closed on trips and conversations).
--  * Least privilege: signed-in users get select and insert only; anon gets nothing.
--    (No edit or delete: the ticket asks only for add and view. Deleting a car still
--    removes its fill-ups through the foreign key.)
-- ----------------------------------------------------------------------------------
create table public.fuel_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  filled_at date not null,
  liters numeric not null,
  cost_amount numeric not null,
  cost_currency text not null,
  created_at timestamptz not null default now(),
  constraint fuel_logs_filled_at_range_check check (filled_at between date '2000-01-01' and date '2100-12-31'),
  constraint fuel_logs_liters_range_check check (liters > 0 and liters <= 200),
  constraint fuel_logs_cost_amount_range_check check (cost_amount > 0 and cost_amount <= 1000000000000),
  constraint fuel_logs_cost_currency_check check (cost_currency in ('USD', 'LBP'))
);

create index fuel_logs_car_id_filled_at_idx on public.fuel_logs (car_id, filled_at desc);
create index fuel_logs_user_id_idx on public.fuel_logs (user_id);

alter table public.fuel_logs enable row level security;

create policy "Users can view their own fuel logs" on public.fuel_logs
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own fuel logs" on public.fuel_logs
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid())
  );

revoke all on public.fuel_logs from anon, authenticated;
grant select, insert on public.fuel_logs to authenticated;
