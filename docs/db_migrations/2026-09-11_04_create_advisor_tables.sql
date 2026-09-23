-- Exported from the live Supabase project's migration history (version 20260911081723,
-- name create_advisor_tables) so the database can be recreated from this repo.
-- Everything below the line is the migration's SQL, verbatim.
-- Apply the files in this folder in filename order — see README.md, "Database setup".
-- ----------------------------------------------------------------------------------
create table public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  created_at timestamptz not null default now()
);

create index advisor_conversations_user_id_idx on public.advisor_conversations(user_id);

alter table public.advisor_conversations enable row level security;

create policy "Users can view their own conversations"
  on public.advisor_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own conversations"
  on public.advisor_conversations for insert
  with check (auth.uid() = user_id);

create table public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'ai')),
  message_text text not null,
  recommendation text check (recommendation in ('diy', 'mechanic') or recommendation is null),
  created_at timestamptz not null default now()
);

create index advisor_messages_conversation_id_idx on public.advisor_messages(conversation_id);

alter table public.advisor_messages enable row level security;

create policy "Users can view messages in their own conversations"
  on public.advisor_messages for select
  using (
    exists (
      select 1 from public.advisor_conversations c
      where c.id = advisor_messages.conversation_id
      and c.user_id = auth.uid()
    )
  );

create policy "Users can insert messages in their own conversations"
  on public.advisor_messages for insert
  with check (
    exists (
      select 1 from public.advisor_conversations c
      where c.id = advisor_messages.conversation_id
      and c.user_id = auth.uid()
    )
  );
