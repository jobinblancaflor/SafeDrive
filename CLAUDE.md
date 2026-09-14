# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build — also runs full type-check + eslint, treat as the CI gate
npm run start    # run a production build
npm run lint     # eslint only (next/core-web-vitals + next/typescript)
npx tsc --noEmit -p .   # type-check only, faster than a full build
```

**There is no test framework in this repo** (no jest/vitest/playwright, no `test` script). The verification bar for any change is `npx tsc --noEmit -p .` + `npx eslint <changed files>` + `npm run build`, plus — for anything touching the database — direct verification against the live Supabase project via its SQL editor or the Supabase MCP tools (`execute_sql`, `apply_migration`) rather than a local test suite.

To run one file's lint: `npx eslint path/to/file.ts`.

## Tech stack

- **Next.js 14** (App Router, Server Components by default), TypeScript, Tailwind, shadcn-style primitives in `components/ui/`
- **Supabase**: Postgres + RLS for authorization, Auth for sessions, Storage for file uploads. `@supabase/ssr` for cookie-based sessions (`lib/supabase/server.ts` for Server Components/Route Handlers, `lib/supabase/client.ts` for Client Components), a service-role client for privileged server-side work (`lib/supabase/admin.ts`), and an anon-key-plus-bearer-token client for native/mobile callers that have no cookie jar (`lib/supabase/bearer.ts`)
- **Stripe** for subscriptions, driven entirely by a webhook (`app/api/stripe/webhook`)
- **Firebase Cloud Messaging** (`firebase-admin`, wrapped in `lib/fcm.ts`) for device push notifications
- **OpenStreetMap** via `react-leaflet` + `leaflet.markercluster` for the incident/monitor/ping maps — no Google Maps API key needed
- react-hook-form + zod for forms; zod also validates every API route body
- `@tanstack/react-table` for the admin tables; `swagger-ui-react` renders the generated OpenAPI doc at `/api-docs`

## Architecture

### Route groups and role gating

`app/(public)/*` is unauthenticated (login, signup, password reset, FAQ, terms, privacy, contact). `app/(authed)/*` requires a session and is further split by role: `/admin/*` (admin only), `/authority/*` (admin or authority), `/services/*` (any authenticated role — the rider-facing seller directory), plus shared pages like `/profile`, `/settings`, `/onboarding/seller`.

All of this is enforced in one place: **`middleware.ts`**. It fetches the caller's `profiles.role` once per request and handles three separate gates: the admin/authority prefix checks, a hard onboarding gate for the `seller` role (redirects to `/onboarding/seller` until `seller_profiles.onboarding_completed_at` is set — deep-linking around it doesn't work), and the logged-in-user-hits-`/login` redirect. The middleware's matcher excludes `/api/*` entirely — API routes each do their own auth check inline (see below), they are not covered by this gate.

### Two authorization models, by caller type

1. **Browser (web dashboard)** — Supabase session cookies via `@supabase/ssr`. `lib/supabase/server.ts`'s `createClient()` reads `sb-access-token`/`sb-refresh-token` from `next/headers` cookies. Route handlers call `supabase.auth.getUser()` then check `profiles.role`.
2. **Native mobile app** — no cookie jar for this domain, so it sends `Authorization: Bearer <supabase_access_token>` instead. `lib/supabase/bearer.ts`'s `createBearerClient()` builds an anon-key client with that token attached to every request — **not** the service-role client, so Postgres RLS still applies as that specific user. `GET /api/incidents` is the current example: it accepts either auth path and runs the identical query for both; RLS alone (`is_staff(auth.uid()) or user_id = auth.uid()`) decides whether the caller sees every incident (staff) or only their own (rider).
3. **Device-facing endpoints** (no user session at all — the phone's hardware, not a logged-in user) use a third mechanism: a shared-secret `X-Device-Key` header, checked via `lib/device-auth.ts`'s `requireDeviceKey()` with a constant-time comparison. This gates incident ingestion, device registration, and the ping ack endpoint. It fails **closed** (503) if `DEVICE_API_KEY` isn't configured.

Never assume `createClient()` (cookie) is the only way a route is called — check whether a route is meant to be reachable from the mobile app before assuming session cookies are available.

### RLS-gates-RETURNING pitfall

Postgres RLS's `SELECT` policy also gates a `.insert().select()` or `.update().select()` chain's `RETURNING` clause. An anonymous or non-owner writer whose `SELECT` policy would deny them read access gets the write itself rejected purely because `.select()` was chained after it — this looks like the insert/update failed, but it's the read-back that failed. Fix is to use `createAdminClient()` (service-role, bypasses RLS) for any route where the caller isn't guaranteed to pass the table's own `SELECT` policy — this repo's device-facing routes (`/api/incidents/report`, `/api/incidents/log`, `/api/devices/register`, `/api/devices/fcm-token`, `PATCH /api/ping`, `/api/ping/location`, `/api/contact`) all do this deliberately. A route where the caller always owns the row they just wrote (e.g. a rider inserting their own `seller_inquiries` row) doesn't need this — its own `SELECT` policy already covers it.

### Schema drift from migration files

This Supabase project's live schema has, more than once, drifted from what `supabase/migrations/*.sql` describes — DDL applied ad hoc outside of migrations doesn't get tracked and can silently vanish (a `seller_profiles` table was lost this way once and had to be reconstructed from a stale migration file). Two concrete drifts still in effect:
- `incidents.device_id` / `incident_logs.device_id` are plain **text** columns holding the hardware's own id string directly (e.g. `"bff60f44be2a18fe"`), **not** a uuid FK into `devices.id` as the original migrations describe. See `lib/incident-ingest.ts`'s `resolveUserId`/`touchDevice` for the resulting handling.
- New tables/views in this project pick up broad default `SELECT` grants for both `anon` and `authenticated` — an explicit `revoke select on <table> from anon;` is needed wherever anonymous access must genuinely be blocked (see `supabase/migrations/0017_seller_directory_view.sql`), not just omitting a grant.

Given this history, treat the migration files as the intended schema, not a guaranteed description of the live one — verify anything schema-related directly against the live project before relying on it, and always add new/changed DDL through a tracked migration (`apply_migration` if using the Supabase MCP tools) written idempotently (`create table if not exists`, `create or replace view`, a guarded `do $$ ... if not exists ... $$` block for policies) rather than a bare `execute_sql` call.

### FCM push payload is a string contract, not display text

The mobile app decides what action to take by matching the **notification body string**, not the `data` payload — because FCM's `data` bundle is only reliably delivered to the app automatically when it's in the foreground; backgrounded/killed relies on the OS showing the notification from the `notification` block, with `data` only reaching the app if the user taps it. `lib/fcm.ts` documents the exact current body formats (`START-{uuid}`, `STOP-{uuid}`, `STOP_EMERGENCY-{uuid}`, `START-{uuid} . Ping ID: {pingId}`) — treat these as an API contract with the mobile client, not cosmetic copy. Changing them requires coordinating with the mobile app.

### API documentation — two files, two audiences, both need updating

- **`api-docs.json`** (repo root) — the file `lib/api-docs-to-openapi.ts` actually converts and serves at `/api-docs` (Swagger UI). Shape: `{ routes: [{ path, methods: string[], ... }] }`.
- **`docs/api.json`** — a human-reference doc; nothing in the app reads it. Shape: `{ endpoints: [{ path, method: string, ... }] }`.

These are not interchangeable and neither auto-generates from the other — every new or changed API route needs both updated by hand.

### Directory map (non-obvious parts only)

- `lib/rbac.ts` — the single source of truth for role checks in Server Components (`requireProfile`, `requireRole`, `isStaff`); mirrors the `is_admin()`/`is_staff()` SQL functions used in RLS policies.
- `lib/seller-service-type.ts` — the closed service catalog (`towing`/`battery`/`tire`/`lockout`) shared by onboarding, the directory, inquiries, and reviews.
- `supabase/migrations/` — numbered sequentially; run in order against a fresh project. `0016_seller_marketplace_phase1.sql` doubles as the recovery migration after the schema-drift incident described above (its header comments explain why).
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — design specs and implementation plans written during feature development (e.g. the seller marketplace's 4-phase rollout). Useful background on *why* a feature is shaped the way it is, not just *what* it does.

## Current status and features

**Roles**: `rider` (default), `seller` (hard-gated through a 5-step onboarding wizard before reaching the rest of the dashboard — business details, services offered, service area, business documents, service agreement), `authority`, `admin`.

**Shipped:**
- Auth (email/password + Google OAuth), profile, settings, emergency contacts, self-service account deletion (cascades across owned data; anonymizes `devices`/`incidents`/`logs` rather than deleting them, per the existing retention design)
- Incident reporting pipeline: device-facing ingest (`/api/incidents/report`, `/api/incidents/log`) → staff dashboard list/monitor/map (`/api/incidents`, now reachable from both the web dashboard and the mobile app via cookie or Bearer auth respectively) → per-incident detail and status updates
- Ping: staff can send a one-shot location ping or start/stop standing pings to a device via FCM; the device reports location back through `/api/ping/location`; the admin ping map live-updates via a `postgres_changes` Realtime subscription on `pings` and recenters/draws an accuracy circle as new locations arrive
- Contact form + Mailchimp newsletter signup
- Stripe subscription billing via webhook
- **Seller marketplace** (built across 4 phases, see `docs/superpowers/specs/2026-08-27-seller-marketplace-design.md`):
  1. Onboarding expansion + hard gate (documents, service agreement, closed service catalog)
  2. Rider-facing seller directory (`/services`, `/services/[sellerId]`) — reads from a `seller_directory` view that structurally excludes seller contact info, not just hides it in the UI
  3. Contact-us routing (`seller_inquiries`) — riders can only reach staff about a seller, never the seller directly; enforced by giving the `seller` role zero RLS read access to that table, not just omitting a UI path
  4. Reviews (`seller_reviews`) — a rider can review a seller only after having an inquiry on file (enforced in the `INSERT` RLS policy itself), staff can hide a review from the seller's own detail page

**Known gaps / in progress:**
- Start/stop standing-ping pushes are confirmed sent successfully server-side (FCM accepts them, no error) but are not reliably acted on by the mobile app — suspected mismatch in the app's notification-body matcher (it may require the one-shot ping's `" . Ping ID:"` suffix to recognize a `START-`/`STOP-` message at all). This needs a fix on the mobile app side; not something the backend alone can resolve.
- No admin UI yet for reviewing seller documents (business permit / government ID) — they're in a private Storage bucket, fetched ad hoc via the Supabase dashboard/SQL rather than a built page.
