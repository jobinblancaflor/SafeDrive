-- 0023_incident_assignment_escalation.sql
-- Incident assignment, acknowledgement, and time-based escalation.
--
-- * incidents gains assigned_to/assigned_at (which staff member owns it),
--   acknowledged_at/acknowledged_by (first staff action on it), and
--   escalation_level/escalated_at.
-- * escalate_stale_incidents() (pg_cron, every 30s) raises escalation_level
--   by one, up to 3, each time an incident stays unacknowledged for another
--   ESCALATION_STEP (2 minutes) — level 1 at 2 min, 2 at 4 min, 3 at 6 min.
--   Each step writes an 'incident.escalated' row to logs. Only incidents
--   from the last 24h, not canceled, are considered.
-- * Existing incidents are backfilled as acknowledged (acknowledged_at =
--   created_at) so the historical backlog doesn't escalate on rollout.
-- * Re-adds incidents to the supabase_realtime publication: 0003 intended
--   this, but the live project had drifted and lost it, so the staff
--   dashboard's realtime subscription never fired.
-- Idempotent: safe to re-run.

alter table public.incidents
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.profiles(id) on delete set null,
  add column if not exists escalation_level smallint not null default 0,
  add column if not exists escalated_at timestamptz;

-- Backfill only rows that predate this feature (fixed cutoff, so re-runs
-- never silently acknowledge new incidents).
update public.incidents
set acknowledged_at = created_at
where acknowledged_at is null
  and created_at < timestamptz '2026-11-10 00:00:00+00';

create index if not exists incidents_unacknowledged_idx
  on public.incidents (created_at)
  where acknowledged_at is null;
create index if not exists incidents_assigned_to_idx
  on public.incidents (assigned_to);

create or replace function public.escalate_stale_incidents()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  step constant interval := interval '2 minutes';
  max_level constant smallint := 3;
  n integer;
begin
  with bumped as (
    update public.incidents i
    set escalation_level = i.escalation_level + 1,
        escalated_at = now()
    where i.acknowledged_at is null
      and i.status <> 'canceled'
      and i.created_at > now() - interval '24 hours'
      and i.escalation_level < max_level
      and i.created_at <= now() - step * (i.escalation_level + 1)
    returning i.id, i.escalation_level
  ), logged as (
    insert into public.logs (actor, action, entity, entity_id, meta)
    select null, 'incident.escalated', 'incident', b.id::text,
           jsonb_build_object('level', b.escalation_level)
    from bumped b
    returning 1
  )
  select count(*) into n from logged;
  return n;
end;
$$;

revoke execute on function public.escalate_stale_incidents() from public, anon, authenticated;
grant execute on function public.escalate_stale_incidents() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'incident-escalation') then
    perform cron.unschedule('incident-escalation');
  end if;
end $$;

select cron.schedule('incident-escalation', '30 seconds', 'select public.escalate_stale_incidents()');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incidents'
  ) then
    alter publication supabase_realtime add table public.incidents;
  end if;
end $$;
