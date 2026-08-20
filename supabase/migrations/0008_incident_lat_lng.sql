-- Store incident coordinates as ordinary numeric columns.
-- This matches the production incidents schema used by the admin API.

alter table public.incidents
  add column if not exists lat double precision,
  add column if not exists lng double precision;

create index if not exists incidents_lat_lng_idx
  on public.incidents (lat, lng);
