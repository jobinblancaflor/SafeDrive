-- 0022_sms_outbox.sql
-- Emergency-contact SMS on incident report. See
-- docs/superpowers/specs/2026-09-27-emergency-sms-schedule-design.md.
--
-- Durable outbox: /api/incidents/report inserts one row per emergency
-- contact, spaced 10s apart via send_at. pg_cron ticks every 2s and, only
-- when something is due, pg_net POSTs to /api/sms/dispatch, which claims due
-- rows with claim_due_sms() and sends them through the SMS provider.
--
-- The dispatch URL and shared secret live in Vault, never in this file.
-- Operator sets them once:
--   select vault.create_secret('https://<site>/api/sms/dispatch', 'sms_dispatch_url');
--   select vault.create_secret('<SMS_DISPATCH_SECRET value>', 'sms_dispatch_secret');
-- Until then the cron tick errors harmlessly and rows stay 'pending'.
-- Idempotent: safe to re-run.

create table if not exists public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  contact_id uuid references public.emergency_contacts(id) on delete set null,
  phone text not null,
  message text not null,
  send_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists sms_outbox_due_idx
  on public.sms_outbox (send_at) where status = 'pending';
create index if not exists sms_outbox_incident_idx
  on public.sms_outbox (incident_id);

alter table public.sms_outbox enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'sms_outbox' and policyname = 'sms_outbox staff read'
  ) then
    create policy "sms_outbox staff read" on public.sms_outbox
      for select using (public.is_staff(auth.uid()));
  end if;
end $$;

-- Live project grants broad defaults on new tables; writes only ever go
-- through the service-role client.
revoke all on public.sms_outbox from anon;
revoke insert, update, delete on public.sms_outbox from authenticated;

create or replace function public.claim_due_sms(max_rows integer)
returns setof public.sms_outbox
language sql
security definer
set search_path = public
as $$
  update public.sms_outbox o
  set status = 'sending', claimed_at = now()
  where o.id in (
    select id from public.sms_outbox
    where (status = 'pending' and send_at <= now())
       or (status = 'sending' and claimed_at < now() - interval '60 seconds')
    order by send_at
    limit max_rows
    for update skip locked
  )
  returning o.*;
$$;

revoke execute on function public.claim_due_sms(integer) from public, anon, authenticated;
grant execute on function public.claim_due_sms(integer) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'sms-dispatch') then
    perform cron.unschedule('sms-dispatch');
  end if;
end $$;

select cron.schedule(
  'sms-dispatch',
  '2 seconds',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'sms_dispatch_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Dispatch-Key', (select decrypted_secret from vault.decrypted_secrets where name = 'sms_dispatch_secret')),
    body    := '{}'::jsonb
  )
  where exists (
    select 1 from public.sms_outbox
    where (status = 'pending' and send_at <= now())
       or (status = 'sending' and claimed_at < now() - interval '60 seconds')
  );
  $cron$
);
