-- Exported from the live Supabase project's migration history (version 20261019212215,
-- name car64_car_expenses) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- CAR-64: non-fuel car expenses. Additive only: one new table, nothing existing changes.
create table public.car_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  spent_on date not null,
  category text not null,
  amount numeric not null,
  currency text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint car_expenses_spent_on_range_check check (spent_on between date '2000-01-01' and date '2100-12-31'),
  constraint car_expenses_category_check check (category in
    ('repair', 'maintenance', 'insurance', 'registration', 'parking', 'car_wash', 'tolls', 'fines', 'other')),
  constraint car_expenses_amount_range_check check (amount > 0 and amount <= 1000000000000),
  constraint car_expenses_currency_check check (currency in ('USD', 'LBP')),
  constraint car_expenses_note_length_check check (note is null or char_length(note) <= 300)
);

comment on table public.car_expenses is
  'CAR-64: a non-fuel cost for one car. amount is stored exactly as typed with its currency (USD or LBP); conversion happens only when shown. Never edited (no UPDATE); the owner may delete one.';

create index car_expenses_car_id_spent_on_idx on public.car_expenses (car_id, spent_on desc);
create index car_expenses_user_id_idx on public.car_expenses (user_id);

alter table public.car_expenses enable row level security;

create policy "Users can view their own expenses" on public.car_expenses
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can add expenses to their own cars" on public.car_expenses
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid())
  );

create policy "Users can delete their own expenses" on public.car_expenses
  for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.car_expenses from anon, authenticated;
grant select, insert, delete on public.car_expenses to authenticated;
