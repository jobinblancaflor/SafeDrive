-- Ping delivery tracking.
--
-- Until now a ping only had status sent|received, and in practice every
-- live row stayed 'sent': the device app reports its location through
-- POST /api/ping/location but never calls the PATCH /api/ping ack, so the
-- dashboard could not tell "device answered" from "nothing happened", and
-- a failed FCM push was only reported in that one HTTP response.
--
-- Adds:
--   received_at  first time the device answered (ack or location report)
--   located_at   last time the device reported a location for this ping
--   push_error   why the FCM push failed, null if it went out
--
-- "No response" is not stored: the dashboard derives it from
-- status = 'sent' and ping_date older than the timeout (lib/ping-status.ts),
-- so changing the timeout never needs a data migration.

alter table public.pings add column if not exists received_at timestamptz;
alter table public.pings add column if not exists located_at timestamptz;
alter table public.pings add column if not exists push_error text;

-- Pings that already carry a location were answered by the device even
-- though no ack arrived. Exact answer times weren't recorded, so the
-- timestamps stay null.
update public.pings
set status = 'received'
where status = 'sent' and lat is not null and lng is not null;

create index if not exists pings_device_date_idx
  on public.pings (device_id, ping_date desc);
