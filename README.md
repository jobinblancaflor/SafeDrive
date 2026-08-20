# Secure Signal Admin

Next.js 14 (App Router) admin + authority dashboard for Secure Signal. Uses Supabase
Auth, Postgres + RLS, Stripe subscriptions, Firebase Cloud Messaging for device
ping, and Google Maps for incident monitoring.

## Stack

- Next.js 14, TypeScript, Tailwind, shadcn-style components
- Supabase (auth + db + storage) — `@supabase/ssr` for cookies
- Stripe webhook → `subscriptions` table
- FCM (firebase-admin) for device pings
- OpenStreetMap (`react-leaflet` + `leaflet.markercluster`)
- react-hook-form + zod for forms
- @tanstack/react-table-ready `<table>` primitives

## Setup

1. Copy env template:
   ```
   cp .env.local.example .env.local
   ```
   Fill in the keys for Supabase, Google Maps, Stripe, and Firebase.

2. Run the SQL migrations against your Supabase project, in order:
   - `supabase/migrations/0001_init.sql` through `0010_incident_location_nullable.sql`
     (open the Supabase SQL editor and run each file in numeric order, or use
     `supabase db push` with the Supabase CLI)
   - `supabase/seed.sql` (after creating the seed auth users via the dashboard)

3. Install + dev:
   ```
   npm install
   npm run dev
   ```

4. Open http://localhost:3000 — middleware redirects to `/login`.

## Roles

- **rider** (default): profile, settings, emergency contacts
- **authority**: `/authority/*` — incidents, monitor, ping
- **admin**: `/admin/*` — users, payments, incidents, monitor, ping, settings

Middleware gates `/admin/*` (admin only) and `/authority/*` (admin or authority).
RLS policies in `0001_init.sql` enforce row-level access in the database.

## Map

Incident map uses clustered OpenStreetMap markers via Leaflet — no API key required.
Tiles load from the public `tile.openstreetmap.org` server; that server's usage policy
discourages heavy production traffic, so swap in a different tile provider
(e.g. CARTO's free basemaps) in `components/map/leaflet-map-impl.tsx` if load grows.

## Ping

`POST /api/ping` (admin/authority) inserts a `pings` row (`status=sent`) and
sends an FCM push to the most recent FCM token registered for the device.
Devices call `PATCH /api/ping` with `{ ping_id }` to mark it `received`.

## Troubleshooting: incidents list is empty or fails to load

1. **Check the actual error.** Open the browser dev tools Network tab, find
   the `/api/incidents` request, and look at the JSON body — it now includes
   a specific message instead of a bare 500.
2. **Missing migrations.** If the error mentions a column like
   `incidents.created_at`, `incidents.lat`, or `incidents.incident_type` not
   existing, your database is missing migrations — run every file in
   `supabase/migrations/` in order (0001 → 0010).
3. **Historic bug (fixed by 0010):** `0001_init.sql` defined
   `incidents.location` as `NOT NULL`, but the app writes `lat`/`lng`
   instead of `location`. Before migration `0010_incident_location_nullable.sql`
   existed, every insert into `incidents` — including `supabase/seed.sql` and
   `POST /api/incident` — failed silently against that constraint, so the
   table stayed empty. Make sure `0010` has been applied.
4. **Wrong role.** `/api/incidents` only allows `admin` or `authority`
   profiles (403 otherwise) — check the signed-in user's `role` in
   `public.profiles`.
5. **RLS.** If you're querying Supabase directly (not through the app),
   remember `incidents` RLS only allows staff (`is_staff()`) or the
   incident's own `user_id` to `select` rows.

## Stripe

Webhook endpoint: `POST /api/stripe/webhook`. Configure the endpoint in the
Stripe dashboard and set `STRIPE_WEBHOOK_SECRET`. Subscription metadata should
include `supabase_user_id` so the webhook can attach the subscription to a
profile.