-- 0012_incident_messages.sql
-- Per-incident messaging between staff (admin/authority) and the rider who
-- reported the incident. Powers a chat panel on the monitor page.

create table if not exists public.incident_messages (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists incident_messages_incident_id_created_at_idx
  on public.incident_messages (incident_id, created_at);

alter table public.incident_messages enable row level security;

-- Staff can read/send on any incident.
create policy "incident_message staff read" on public.incident_messages
  for select using (public.is_staff(auth.uid()));
create policy "incident_message staff insert" on public.incident_messages
  for insert with check (public.is_staff(auth.uid()) and sender_id = auth.uid());

-- Riders can read/send only on their own incident.
create policy "incident_message owner read" on public.incident_messages
  for select using (
    exists (
      select 1 from public.incidents i
      where i.id = incident_messages.incident_id and i.user_id = auth.uid()
    )
  );
create policy "incident_message owner insert" on public.incident_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.incidents i
      where i.id = incident_messages.incident_id and i.user_id = auth.uid()
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'incident_messages'
  ) then
    alter publication supabase_realtime add table public.incident_messages;
  end if;
end $$;
