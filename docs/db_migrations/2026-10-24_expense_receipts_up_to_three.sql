-- Run by the developer in the Supabase SQL editor on 2026-10-24 (in one transaction), so it is NOT in
-- the project's migration history (there is no version number). Verified afterwards with pg_constraint,
-- pg_indexes and pg_policies: expense_id_key is gone, (expense_id, storage_path) is unique, and the
-- insert policy text matches this file.
-- Rollback: drop the new constraint, add `unique (expense_id)` back under its old name and recreate the
-- old insert policy (without the "< 3" line). It FAILS once any expense has more than one receipt.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
-- An expense can have up to 3 receipt photos, like a maintenance completion.
--
-- Why: 2026-10-21_record_photos_storage.sql made car_expense_receipts.expense_id unique
-- ("at most one per expense"), but the Add Expense form lets the user attach up to 3 photos.
-- Photos 2 and 3 failed their insert with a 409 and were dropped. This file does not edit the
-- old migration (it was applied as written); it changes the live table instead.
--
-- 1. The unique constraint on expense_id goes. It also owned the index that listing and the
--    ON DELETE CASCADE use, so the new (expense_id, storage_path) constraint's index replaces it
--    (expense_id is its leading column).
-- 2. (expense_id, storage_path) is unique. storage_path is already unique on its own, so this is
--    belt and braces; it is the constraint the developer asked for.
-- 3. The database keeps enforcing the limit: without a unique expense_id nothing would stop a
--    client attaching 100 receipts to one expense. The insert policy is recreated, identical to
--    the old one plus "fewer than 3 receipts on this expense already". (A count-then-insert check
--    can be beaten by two simultaneous inserts, the same limit the 100-photo cap already has;
--    the form inserts one photo at a time.)
--
-- Nothing else changes: the delete trigger fires per row, so deleting an expense (or its car)
-- queues every receipt file in storage_cleanup_queue; the storage policies key on the row's
-- storage_path, which stays unique per photo.

alter table public.car_expense_receipts drop constraint car_expense_receipts_expense_id_key;
alter table public.car_expense_receipts
  add constraint car_expense_receipts_expense_id_storage_path_key unique (expense_id, storage_path);

drop policy "Users can add a receipt to their own expense" on public.car_expense_receipts;
create policy "Users can add a receipt to their own expense" on public.car_expense_receipts
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.car_expenses e where e.id = expense_id and e.user_id = auth.uid())
    and storage_path = auth.uid()::text || '/receipts/' || expense_id::text || '/' || id::text || '.jpg'
    and (select count(*) from public.car_expense_receipts r where r.expense_id = car_expense_receipts.expense_id) < 3
    and (select count(*) from public.maintenance_record_photos p where p.user_id = auth.uid())
      + (select count(*) from public.car_expense_receipts e where e.user_id = auth.uid()) < 100);
