# Emergency Contact SMS Scheduling — Design

**Date:** 2026-09-27
**Status:** Approved (pending spec review)

## Goal

When a device reports an incident (`POST /api/incidents/report`), text every
emergency contact of the incident's rider, one contact at a time, spaced 10
seconds apart. Stop texting remaining contacts if the incident is canceled
mid-sequence.

## Decisions

| Question | Decision |
|---|---|
| SMS provider | **Semaphore** (PH gateway, paid per SMS, regular `/api/v4/messages` endpoint — 1 credit/SMS) behind a provider interface, so it can be swapped by env var |
| Trigger | Automatic, on incident report only (no staff button) |
| Cancel mid-sequence | Remaining unsent SMS are skipped; no "all clear" message |
| Message | `SECURE SIGNAL ALERT: {fullname} may need help ({incident type}). Location: https://maps.google.com/?q={lat},{lng}` |
| Scheduling mechanism | Durable outbox table + `pg_cron` (every 2s) → `pg_net` → Next.js dispatch route |

### Why not sleep in the request / an Edge Function loop

A 10s × N-contact loop (5 contacts = 40s+) inside a serverless function runs
into function time limits, and the whole sequence is lost if the instance
dies. This is a safety path — it must survive crashes and redeploys, so the
schedule lives in Postgres. Both `pg_cron` (1.6.4, supports second-granularity
schedules) and `pg_net` are already installed on the live project.

## Architecture

```
device ──POST /api/incidents/report──▶ insert incident
                                        └─ scheduleEmergencySms()  → sms_outbox rows
                                           (send_at = now + i×10s)

pg_cron "sms-dispatch" every 2s:
  if exists(pending row with send_at <= now())
     net.http_post(<site>/api/sms/dispatch, X-Dispatch-Key)

POST /api/sms/dispatch:
  claim_due_sms(n) → for each row:
     incident canceled?  → status = skipped
     else provider.send  → status = sent | retry | failed
```

## 1. Data — `supabase/migrations/0021_sms_outbox.sql`

Idempotent, applied via `apply_migration`.

**Table `public.sms_outbox`**

| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `incident_id` | uuid not null | FK `incidents(id)` on delete cascade |
| `contact_id` | uuid null | FK `emergency_contacts(id)` on delete set null |
| `phone` | text not null | snapshot at schedule time |
| `message` | text not null | snapshot at schedule time |
| `send_at` | timestamptz not null | |
| `status` | text not null default `'pending'` | check in (`pending`,`sending`,`sent`,`failed`,`skipped`) |
| `attempts` | int not null default 0 | |
| `claimed_at` | timestamptz null | set when claimed for sending |
| `sent_at` | timestamptz null | |
| `provider_message_id` | text null | |
| `last_error` | text null | |
| `created_at` | timestamptz not null default now() | |

- Partial index `on sms_outbox (send_at) where status = 'pending'`.
- Index on `incident_id`.
- RLS enabled. `SELECT` policy: `is_staff(auth.uid())`. No insert/update/delete
  policies — all writes go through the service-role client.
- `revoke all on sms_outbox from anon;` (live project grants broad defaults to
  new tables — see CLAUDE.md "Schema drift").

**Function `public.claim_due_sms(max_rows int)`** — `security definer`,
returns `setof sms_outbox`. In one statement:

- selects rows where (`status = 'pending' and send_at <= now()`) **or**
  (`status = 'sending' and claimed_at < now() - interval '60 seconds'`) —
  the latter reclaims rows orphaned by a crashed dispatch;
- ordered by `send_at`, limited to `max_rows`, `for update skip locked`;
- updates them to `status = 'sending', claimed_at = now()` and returns them.

`revoke execute ... from public, anon, authenticated; grant execute ... to service_role;`

**pg_cron job `sms-dispatch`**, schedule `'2 seconds'`:

```sql
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
```

Scheduled idempotently (unschedule-if-exists, then schedule). The URL and
secret live in **Vault**, never in the migration file; the operator sets them
once:

```sql
select vault.create_secret('https://<site>/api/sms/dispatch', 'sms_dispatch_url');
select vault.create_secret('<same value as SMS_DISPATCH_SECRET>', 'sms_dispatch_secret');
```

If the Vault secrets are missing, `net.http_post` receives a null URL and the
tick is a no-op error in `net._http_response` — the outbox rows stay
`pending` and nothing is lost.

## 2. Scheduling — `lib/sms/schedule.ts`

`scheduleEmergencySms(supabase: SupabaseClient, incident: { id, user_id, lat, lng, incident_type, status })`

- Returns early (nothing scheduled) when `user_id` is null or `status === 'canceled'`.
- Loads the rider's `profiles.fullname` and `emergency_contacts` ordered by
  `created_at asc`. No contacts → nothing scheduled.
- Builds the message once (fullname fallback: `"A Secure Signal user"`;
  incident-type label from `lib/incident-type.ts`, fallback `"emergency"`).
- Inserts one row per contact, contact *i* gets `send_at = now + i × 10s`
  (first contact is due immediately; delivered within ~2s by the next cron
  tick).
- Called from `app/api/incidents/report/route.ts` after the incident insert
  succeeds, wrapped in try/catch: a scheduling failure is logged and **never**
  fails the report (still 201).

## 3. Provider interface — `lib/sms/`

```ts
export interface SmsProvider {
  send(to: string, message: string): Promise<{ id: string | null }>;
}
export function getSmsProvider(): SmsProvider; // by SMS_PROVIDER
```

- `lib/sms/semaphore.ts` — `POST https://api.semaphore.co/api/v4/messages`
  with `apikey` (`SEMAPHORE_API_KEY`), `number`, `message`, and `sendername`
  when `SEMAPHORE_SENDER_NAME` is set. Normalizes phone numbers to
  `63XXXXXXXXXX` (accepts `+639…`, `639…`, `09…`); anything that isn't a PH
  mobile number throws `"unsupported phone number"` (Semaphore is PH-only).
  Non-2xx or an error-shaped response body throws with the provider's message.
- `lib/sms/log.ts` — dry-run adapter: `console.log`s the send and returns a
  fake id. For dev and verification without spending credits.
- `getSmsProvider()` throws if `SMS_PROVIDER` is unset/unknown or the chosen
  provider's key is missing — the dispatch route turns that into a 503 and
  leaves rows untouched.

## 4. Dispatch route — `app/api/sms/dispatch/route.ts`

`POST`, no user session.

- Auth: `X-Dispatch-Key` compared in constant time against
  `SMS_DISPATCH_SECRET` (same pattern as `lib/device-auth.ts`). Missing env →
  503 (fail closed). Wrong key → 401.
- Resolves the provider first; failure → 503 before claiming anything.
- `createAdminClient()`, `rpc('claim_due_sms', { max_rows: 20 })`.
- Loads the claimed rows' incident statuses in one query.
- For each row, sequentially:
  - incident `canceled` (or missing) → `status = 'skipped'`;
  - else `provider.send` → success: `status = 'sent', sent_at = now(), provider_message_id, attempts + 1`;
  - error: `attempts + 1`, `last_error`; if attempts < 3 →
    `status = 'pending', send_at = now() + 10s`; else `status = 'failed'`.
- Responds `{ claimed, sent, skipped, failed, retried }`.

Spacing guarantee: rows are due 10s apart and the cron ticks every 2s, so
actual spacing is 10s ± 2s. Contacts are never batched together because their
`send_at` values differ.

## 5. Other changes

- **Account deletion** (`app/api/account/delete/route.ts`): delete
  `sms_outbox` rows for the user's incidents before incidents are anonymized —
  otherwise contacts' phone numbers would linger in the outbox.
- **`.env.local.example`**: `SMS_PROVIDER`, `SEMAPHORE_API_KEY`,
  `SEMAPHORE_SENDER_NAME`, `SMS_DISPATCH_SECRET`.
- **`api-docs.json`** and **`docs/api.json`**: document `POST /api/sms/dispatch`
  and note the SMS side effect on `POST /api/incidents/report`.
- **CLAUDE.md**: add the SMS pipeline to shipped features and the Vault setup
  step.

## 6. Verification

No test framework in repo, so:

1. `npx tsc --noEmit -p .`, `npx eslint <changed files>`, `npm run build`.
2. Apply migration; verify table, policies, grants, function, and cron job
   via `execute_sql` / `cron.job`.
3. With `SMS_PROVIDER=log` locally: seed a test incident with 3 test contacts
   via `scheduleEmergencySms`, POST `/api/sms/dispatch` manually on a loop,
   confirm `sent_at` spacing ≈ 10s.
4. Repeat, set the incident to `canceled` after the first send; confirm the
   rest become `skipped`.
5. Clean up test rows.
6. Real Semaphore send + cron → deployed URL: done by the user with their own
   API key and Vault secrets (pg_net cannot reach `localhost`).

## Out of scope

- Staff-triggered or re-triggered sends.
- "All clear" SMS on cancel.
- Delivery-receipt tracking / Semaphore webhooks.
- Admin UI for the outbox (staff can query it; UI later if needed).
