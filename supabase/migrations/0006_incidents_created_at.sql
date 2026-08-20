-- 0006_incidents_created_at.sql
-- Add a created_at timestamp so the admin filter UI can scope by row insert
-- time independently of the user-reported occurred_at. Backfilled from
-- occurred_at so historical rows land on their original timestamp.

alter table public.incidents
  add column if not exists created_at timestamptz not null default now();

update public.incidents
  set created_at = occurred_at
  where created_at = now() or created_at is null;

create index if not exists incidents_created_at_desc_idx
  on public.incidents (created_at desc);
