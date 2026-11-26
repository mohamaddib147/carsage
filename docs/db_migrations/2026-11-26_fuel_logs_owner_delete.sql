-- Lets a signed-in user delete their own fill-up (PLAN-05). Run by hand by the developer in the Supabase SQL editor
-- on 2026-11-26, in one transaction (begin/commit), so it is NOT in the project's migration history (there is no
-- version number). Verified afterwards with pg_policies (the policy reads `(( SELECT auth.uid() AS uid) = user_id)`,
-- for DELETE, to authenticated) and role_table_grants (authenticated: DELETE, INSERT, SELECT).
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- Why: a mistyped fill-up (wrong liters, wrong odometer) could not be removed, and it skews the per-liter figures,
-- the real km/L and Trip Planner's estimate for good. Fill-ups stay un-editable (no UPDATE policy, no UPDATE grant):
-- a mistake is deleted and re-added, the same rule as car_expenses.
--
-- Checked read-only before writing this (2026-11-26):
--   - fuel_logs had SELECT and INSERT policies only; authenticated was granted SELECT, INSERT only.
--   - No foreign key points at fuel_logs, no trigger on it, no view, materialized view or public function reads it,
--     it is in no publication, and no storage object belongs to a fill-up. A delete removes that one row only.
--   - Readers that recompute from the remaining rows on their next read: the Dashboard tiles and month total,
--     Maintenance's latest odometer reading, the Expenses month total, and Trip Planner's real km/L (backend).
--
-- Rollback (instant, no data change; rows already deleted stay deleted):
--   drop policy "Users can delete their own fuel logs" on public.fuel_logs;
--   revoke delete on public.fuel_logs from authenticated;

create policy "Users can delete their own fuel logs" on public.fuel_logs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

grant delete on public.fuel_logs to authenticated;
