-- 0005_incident_type.sql
-- Categorise how a Secure Signal incident was raised. Mobile app inserts the type
-- on each new incident; historical rows stay NULL until backfilled.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'incident_type') then
    create type public.incident_type as enum (
      'SOS Button',        -- manual SOS button
      'SOS Volume keys',   -- hardware volume-button combo
      'SOS USB',           -- charger / USB-triggered SOS
      'SOS Fall Detected'  -- automatic fall detection
    );
  end if;
end $$;

alter table public.incidents
  add column if not exists incident_type public.incident_type;

create index if not exists incidents_type_idx on public.incidents (incident_type);
