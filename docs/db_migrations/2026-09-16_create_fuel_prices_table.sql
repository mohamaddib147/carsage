-- Exported from the live Supabase project's migration history (version 20260916083134,
-- name create_fuel_prices_table) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- Caches Lebanon fuel prices scraped weekly from the Directorate General
-- of Oil (dgo.gov.lb, under the Ministry of Energy and Water). Written
-- append-only by the backend's scraper (service role); "current" price
-- for a fuel type is the most recent row. No public read/write policies
-- are granted since only the backend (service role, bypasses RLS) needs
-- access for now.

create table public.fuel_prices (
    id uuid primary key default gen_random_uuid(),
    fuel_type text not null check (fuel_type in ('95_octane', '98_octane', 'diesel')),
    price_per_liter_lbp numeric not null check (price_per_liter_lbp > 0),
    source_label text,
    scraped_at timestamptz not null default now()
);

create index fuel_prices_fuel_type_scraped_at_idx
    on public.fuel_prices (fuel_type, scraped_at desc);

alter table public.fuel_prices enable row level security;
