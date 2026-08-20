-- 0010_incident_location_nullable.sql
--
-- Root cause of "incidents can't be retrieved": there was never any data to
-- retrieve. 0001_init.sql defined `location geography(Point,4326) NOT NULL`,
-- but 0008_incident_lat_lng.sql moved the app over to plain `lat`/`lng`
-- columns — POST /api/incident, supabase/seed.sql, and every other insert
-- path only write `lat`/`lng`, never `location`. Every insert into
-- `incidents` has therefore been failing with a
-- "null value in column location violates not-null constraint" error since
-- 0008 was applied, so the table stayed empty (or stopped growing) and the
-- admin/authority incidents list has nothing to show.
--
-- Fix: make `location` nullable, and keep it in sync from lat/lng via a
-- trigger so the existing GIST spatial index on `location` stays useful for
-- anyone doing PostGIS queries later, without requiring every insert path to
-- know about it.

alter table public.incidents
  alter column location drop not null;

create or replace function public.incidents_sync_location()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_sync_location_trigger on public.incidents;
create trigger incidents_sync_location_trigger
  before insert or update of lat, lng on public.incidents
  for each row execute function public.incidents_sync_location();

-- Backfill location for any existing rows that already have lat/lng but no
-- location set (e.g. rows inserted before this migration under a relaxed
-- constraint some other way).
update public.incidents
set location = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
where lat is not null and lng is not null and location is null;
