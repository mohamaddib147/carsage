-- Exported from the live Supabase project's migration history (version 20261020171920,
-- name ai_camera_usage_limits) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- AI/camera usage limiting. Additive only: three new tables.
-- api_limits is the single source of truth for every per-user and global daily
-- cap -- the triggers read it live, and the backend (app/services/ai_limits.py)
-- reads the same table, cached a few minutes, purely to word a friendly message
-- ("today's limit of N"). Changing a limit is one UPDATE here, no migration, no
-- numbers duplicated anywhere else.
--
-- A feature with NO row in api_limits is blocked outright (every attempt fails).
-- A feature with global_daily = NULL has no global cap at all (advisor,
-- registration_scan). A limit of 0 disables a feature without deleting it.

create table public.api_limits (
  feature text primary key,
  per_user_daily integer not null,
  global_daily integer,  -- null = no global cap for this feature
  updated_at timestamptz not null default now(),
  constraint api_limits_per_user_daily_nonneg check (per_user_daily >= 0),
  constraint api_limits_global_daily_nonneg check (global_daily is null or global_daily >= 0)
);

comment on table public.api_limits is
  'Single source of truth for every AI/camera feature''s daily limits. RLS on, no policies, no grants: only the backend service key can read or write it. app/services/ai_limits.py caches reads from here for display text only -- the real enforcement is the triggers on api_usage / api_usage_global below, which read this table directly, live, every time.';

alter table public.api_limits enable row level security;
revoke all on public.api_limits from anon, authenticated;

insert into public.api_limits (feature, per_user_daily, global_daily) values
  ('camera', 20, 150),
  ('advisor', 60, null),
  ('registration_scan', 5, null);


create table public.api_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null,
  usage_date date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature, usage_date),
  constraint api_usage_count_nonneg check (count >= 0)
);

comment on table public.api_usage is
  'Per-user daily usage counters for Gemini-backed features. RLS on, no policies at all -- not even for the owner -- so only the backend service key can read or write it; a user must never see or reset their own counter. The trigger below enforces the per-user limit from api_limits atomically; Python never computes or checks the count itself.';

alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon, authenticated;


create table public.api_usage_global (
  feature text not null,
  usage_date date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (feature, usage_date),
  constraint api_usage_global_count_nonneg check (count >= 0)
);

comment on table public.api_usage_global is
  'Daily counters shared across ALL users for a feature (currently only camera, via api_limits.global_daily). Same access model as api_usage: RLS on, no policies, service key only.';

alter table public.api_usage_global enable row level security;
revoke all on public.api_usage_global from anon, authenticated;


-- SECURITY INVOKER (not DEFINER): the only role that ever writes to api_usage
-- is the backend's service key, which already bypasses RLS on every table
-- including api_limits, so there is no reason for this function to run with
-- elevated owner privileges. Fixed search_path blocks a schema-shadowing
-- attack; execute is revoked below so nothing but the trigger mechanism
-- itself can invoke it.
create or replace function public.enforce_api_usage_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  limit_row record;
begin
  select * into limit_row from public.api_limits where feature = new.feature;
  if not found then
    -- No row for this feature at all: treat every attempt as blocked.
    raise exception 'USAGE_LIMIT_EXCEEDED';
  end if;

  new.count := case when tg_op = 'INSERT' then 1 else old.count + 1 end;
  if new.count > limit_row.per_user_daily then
    raise exception 'USAGE_LIMIT_EXCEEDED';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.enforce_api_usage_limit() from public, anon, authenticated;

create trigger api_usage_enforce_limit
  before insert or update on public.api_usage
  for each row execute function public.enforce_api_usage_limit();


create or replace function public.enforce_api_usage_global_limit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  limit_row record;
begin
  select * into limit_row from public.api_limits where feature = new.feature;
  if not found then
    raise exception 'USAGE_LIMIT_EXCEEDED';
  end if;

  if limit_row.global_daily is null then
    -- A row exists but this feature has no global cap (advisor,
    -- registration_scan): count it for visibility, never block on it.
    new.count := case when tg_op = 'INSERT' then 1 else old.count + 1 end;
    new.updated_at := now();
    return new;
  end if;

  new.count := case when tg_op = 'INSERT' then 1 else old.count + 1 end;
  if new.count > limit_row.global_daily then
    raise exception 'USAGE_LIMIT_EXCEEDED';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.enforce_api_usage_global_limit() from public, anon, authenticated;

create trigger api_usage_global_enforce_limit
  before insert or update on public.api_usage_global
  for each row execute function public.enforce_api_usage_global_limit();
