-- CAR-24: access-control hardening found by re-testing RLS with two accounts.
-- Applied to the live Supabase project (ehjvbkhoafldqfsivtrn) via the MCP
-- connector. Kept here as an audit trail only — the live schema is the source
-- of truth (docs/CarSage_ERD.pdf is a frozen snapshot and is not updated).
--
-- 1) Cross-user references. RLS only checked `user_id = auth.uid()`, so a user
--    could create (or re-point) their OWN trip / conversation whose car_id is
--    ANOTHER user's car: nothing leaked, but it broke integrity and let the
--    user probe whether a car id exists (201 vs a foreign-key 409). The car a
--    row points at must now belong to the caller. (The FastAPI backend uses
--    the service role, so it is unaffected — and already checks ownership.)
--
-- 2) Least privilege. Supabase grants anon and authenticated every privilege
--    (incl. TRUNCATE, which RLS does not apply to) on every public table. The
--    app never reads the database while logged out, and never needs TRUNCATE,
--    REFERENCES or TRIGGER. PostgREST can't send TRUNCATE, so this wasn't
--    exploitable over the REST API — it is defense in depth.
--
-- To undo: re-create the previous policies (user_id check only) and GRANT the
-- privileges back.

-- ---- 1) trips ---------------------------------------------------------------
drop policy if exists "Users can insert their own trips" on public.trips;
create policy "Users can insert their own trips" on public.trips
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid())
  );

drop policy if exists "Users can update their own trips" on public.trips;
create policy "Users can update their own trips" on public.trips
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid())
  );

-- ---- 1) advisor_conversations -----------------------------------------------
drop policy if exists "Users can insert their own conversations" on public.advisor_conversations;
create policy "Users can insert their own conversations" on public.advisor_conversations
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (car_id is null or exists (select 1 from public.cars c where c.id = car_id and c.user_id = auth.uid()))
  );

-- ---- 2) privileges ----------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
-- fuel_prices is written and read only by the backend (service role).
revoke all on public.fuel_prices from authenticated;

-- Same defaults for tables created in the future.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;
