-- 0009_incident_logs.sql
-- Live location breadcrumb trail for an active incident. The device posts a
-- new row every few seconds while an emergency is in progress (via
-- POST /api/incident/[id]/track); the admin/authority monitor view listens
-- for INSERTs via Supabase Realtime to draw the moving marker + trail.
--
-- This table was already referenced by the frontend (incident-monitor-view.tsx,
-- lib/supabase/types.ts) and typed accordingly, but the table itself was never
-- created — this migration fills that gap.

create table if not exists public.incident_logs (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists incident_logs_incident_id_created_at_idx
  on public.incident_logs (incident_id, created_at desc);
create index if not exists incident_logs_device_id_idx
  on public.incident_logs (device_id);

alter table public.incident_logs enable row level security;

-- Devices post breadcrumbs anonymously while an incident is active (same
-- trust model as incident creation in 0001_init.sql — no session required
-- from the device; access to reading is what RLS restricts).
create policy "incident_log insert" on public.incident_logs
  for insert with check (true);

-- Staff (admin/authority) can read all breadcrumbs to power the live monitor.
create policy "incident_log staff read" on public.incident_logs
  for select using (public.is_staff(auth.uid()));

-- Riders can read the trail for their own incidents.
create policy "incident_log owner read" on public.incident_logs
  for select using (user_id = auth.uid());

-- Broadcast inserts so the monitor page's postgres_changes subscription works.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'incident_logs'
  ) then
    alter publication supabase_realtime add table public.incident_logs;
  end if;
end $$;
