-- DIY success tracking (mentor feedback, no Jira task): lets a user mark whether a
-- DIY advisor suggestion actually fixed their issue, so the Dashboard can show a
-- fix rate and highlight the latest confirmed fix. Applied to the live Supabase
-- project via the MCP connector; kept here so the database can be recreated from
-- this repo. Everything below the line is the migration's SQL, verbatim. Apply the
-- files in this folder in filename order — see README.md, "Database setup".
--
-- Design notes:
--  * marked_fixed is nullable: null = no feedback given yet (the common case), true/
--    false = the user said it worked / didn't. Only meaningful on 'ai' rows with
--    recommendation = 'diy' — a CHECK enforces that so it can never be set on a
--    'mechanic' reply or a user's own message.
--  * `advisor_messages` was created (2026-09-11_04_create_advisor_tables.sql) without
--    explicit grants, so `authenticated` still has the schema's default full
--    UPDATE/DELETE privilege on it — RLS (no update policy existed) was the only
--    thing stopping a write. Adding an update policy now would, combined with that
--    broad grant, let a user rewrite ANY column on their own messages (recommendation,
--    message_text, ...), not just marked_fixed. So the grant is narrowed first to
--    just the one column this feature needs, matching the least-privilege pattern
--    used for fuel_logs — the RLS policy below is then the row-level half of the
--    same restriction (own conversation, and only on a diy AI reply).
-- ----------------------------------------------------------------------------------
alter table public.advisor_messages
  add column marked_fixed boolean,
  add constraint advisor_messages_marked_fixed_only_on_diy_check check (
    marked_fixed is null or (sender = 'ai' and recommendation = 'diy')
  );

create policy "Users can record fix feedback on their own DIY suggestions"
  on public.advisor_messages for update
  using (
    sender = 'ai'
    and recommendation = 'diy'
    and exists (
      select 1 from public.advisor_conversations c
      where c.id = advisor_messages.conversation_id
      and c.user_id = auth.uid()
    )
  )
  with check (
    sender = 'ai'
    and recommendation = 'diy'
    and exists (
      select 1 from public.advisor_conversations c
      where c.id = advisor_messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

revoke update on public.advisor_messages from authenticated;
grant update (marked_fixed) on public.advisor_messages to authenticated;
