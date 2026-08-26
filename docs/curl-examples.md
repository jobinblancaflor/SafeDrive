# Secure Signal Admin — cURL Examples

Working cURL commands for every API endpoint. Run against a local dev server (`npm run dev`) or any deployed instance by changing `BASE_URL`.

```bash
export BASE_URL="http://localhost:3000"
```

## Authentication

Two separate auth mechanisms, depending on who's calling:

**Staff/admin endpoints** rely on the Supabase session cookie (`sb-<project>-auth-token`):

```bash
# Sample — replace with your real cookie
export AUTH_COOKIE='sb-abcdefgh-auth-token=eyJhbGciOiJIUzI1NiIs...'
AUTH=(-H "Cookie: $AUTH_COOKIE")
```

**Device-facing endpoints** (mobile app → backend: incident report/log, device registration, ping ack) require a shared secret sent as the `X-Device-Key` header instead — there's no user session on the device. The value is the `DEVICE_API_KEY` env var configured on the server; get it from whoever manages the deployment, it is not something the client generates.

```bash
export DEVICE_KEY="the DEVICE_API_KEY value"
DEVICE=(-H "X-Device-Key: $DEVICE_KEY")
```

A request to a device endpoint without a valid key gets `401`. A request without `DEVICE_API_KEY` configured on the server at all gets `503` (fails closed, not open).

Every example below uses `${AUTH[@]}` or `${DEVICE[@]}` as appropriate.

---

## Auth callback

```bash
# After OAuth or email-link sign-in, Supabase redirects here with ?code=...&next=...
curl -i "$BASE_URL/api/auth/callback?code=PASTE_CODE&next=/admin/users"
```

---

## Emergency contacts (rider — self)

```bash
# List my contacts
curl "${AUTH[@]}" "$BASE_URL/api/emergency-contact"

# Add a contact
curl "${AUTH[@]}" -X POST "$BASE_URL/api/emergency-contact" \
  -H "Content-Type: application/json" \
  -d '{"fullname":"Mom","phone":"+639171234567"}'

# Update contact 7f3c... — change phone only
curl "${AUTH[@]}" -X PATCH "$BASE_URL/api/emergency-contact/7f3c0000-0000-0000-0000-000000000000" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+639180000000"}'

# Delete contact 7f3c...
curl "${AUTH[@]}" -X DELETE "$BASE_URL/api/emergency-contact/7f3c0000-0000-0000-0000-000000000000"
```

---

## Emergency contacts (admin — on behalf of any rider)

```bash
# List a rider's contacts (admin only)
curl "${AUTH[@]}" "$BASE_URL/api/admin/emergency-contact?user_id=RIDER_UUID"

# Add a contact for a rider
curl "${AUTH[@]}" -X POST "$BASE_URL/api/admin/emergency-contact" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"RIDER_UUID","fullname":"Dad","phone":"+639170000000"}'

# Update any contact by id (admin only)
curl "${AUTH[@]}" -X PATCH "$BASE_URL/api/admin/emergency-contact/7f3c0000-0000-0000-0000-000000000000" \
  -H "Content-Type: application/json" \
  -d '{"fullname":"Dad Updated"}'

# Delete any contact by id (admin only)
curl "${AUTH[@]}" -X DELETE "$BASE_URL/api/admin/emergency-contact/7f3c0000-0000-0000-0000-000000000000"
```

---

## Device registration

```bash
# Register (or confirm) a device belongs to a user, optionally saving its
# current FCM push token. Idempotent: calling again with the same
# device_uuid + user_id is a no-op beyond refreshing fcm_token if a new one
# is sent (e.g. after the OS rotates it) — not a duplicate.
curl "${DEVICE[@]}" -X POST "$BASE_URL/api/devices/register" \
  -H "Content-Type: application/json" \
  -d '{"device_uuid":"bff60f44be2a18fe","user_id":"RIDER_UUID","fcm_token":"FCM_TOKEN"}'
```

Rate limit: 20 requests / hour per IP.

---

## Incidents — current endpoints

These are what the mobile app should call going forward. `user_id`/`device_id` that don't resolve to a real driver/device never fail the request — the report still gets recorded, just without that attribution.

```bash
# Step 1: initial incident report (SOS/fall trigger fires)
curl "${DEVICE[@]}" -X POST "$BASE_URL/api/incidents/report" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 14.6091,
    "lng": 121.0223,
    "user_id": "RIDER_UUID",
    "device_id": "bff60f44be2a18fe",
    "incident_type": "SOS Button"
  }'
# -> 201 { "data": { "id": "INCIDENT_UUID", ... } }  ← keep this id for step 2

# Step 2: location breadcrumb, sent every ~10s while the incident is active
curl "${DEVICE[@]}" -X POST "$BASE_URL/api/incidents/log" \
  -H "Content-Type: application/json" \
  -d '{
    "incident_id": "INCIDENT_UUID",
    "user_id": "RIDER_UUID",
    "device_id": "bff60f44be2a18fe",
    "lat": 14.6095,
    "lng": 121.0228
  }'
```

Valid `incident_type` values: `SOS Button`, `SOS Volume keys`, `SOS USB`, `SOS Fall Detected`. `status` defaults to `reported` if omitted.

Rate limits: `report` — 10 requests / min per IP. `log` — 30 requests / min per incident (comfortably above the ~10s cadence).

```bash
# List incidents for a date (admin/authority only) — UTC date
curl "${AUTH[@]}" "$BASE_URL/api/incidents?date=2026-07-27"

# Fetch one incident
curl "${AUTH[@]}" "$BASE_URL/api/incident/INCIDENT_UUID"

# Mark an incident reported / reopen it (admin/authority)
curl "${AUTH[@]}" -X PATCH "$BASE_URL/api/incident/INCIDENT_UUID/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"reported"}'
```

### Legacy endpoints (still live, hardened the same way)

`POST /api/incident` and `POST /api/incident/:id/track` predate `/api/incidents/report` and `/api/incidents/log` and use different field names (`device_uuid` instead of `device_id`, no `user_id`/`incident_type`/`status`). Still work, still require `X-Device-Key` and are rate-limited the same way — kept alive for whatever mobile app builds still call them, but new integrations should use the endpoints above.

```bash
curl "${DEVICE[@]}" -X POST "$BASE_URL/api/incident" \
  -H "Content-Type: application/json" \
  -d '{"lng":121.0,"lat":14.6,"device_uuid":"dev-uuid-001"}'

curl "${DEVICE[@]}" -X POST "$BASE_URL/api/incident/INCIDENT_UUID/track" \
  -H "Content-Type: application/json" \
  -d '{"lat":14.6,"lng":121.0,"device_uuid":"dev-uuid-001"}'

curl "${AUTH[@]}" "$BASE_URL/api/incident/INCIDENT_UUID/track"
```

---

## Ping

```bash
# Send a ping (admin/authority) — inserts a pings row + best-effort FCM push
curl "${AUTH[@]}" -X POST "$BASE_URL/api/ping" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"DEVICE_UUID"}'

# Device callback — mark ping received (requires X-Device-Key)
curl "${DEVICE[@]}" -X PATCH "$BASE_URL/api/ping" \
  -H "Content-Type: application/json" \
  -d '{"ping_id":"PING_UUID"}'

# Tell a device to start/stop its standard (non-emergency) location pings —
# admin/authority, session-authenticated like the send-ping call above
curl "${AUTH[@]}" -X POST "$BASE_URL/api/ping/start" \
  -H "Content-Type: application/json" -d '{"device_id":"DEVICE_UUID"}'
curl "${AUTH[@]}" -X POST "$BASE_URL/api/ping/stop" \
  -H "Content-Type: application/json" -d '{"device_id":"DEVICE_UUID"}'
```

---

## Contact form

```bash
# Public submission
curl -X POST "$BASE_URL/api/contact" \
  -H "Content-Type: application/json" \
  -d '{"name":"Curious User","email":"curious@example.com","message":"Do you have a family plan?"}'

# Admin reads latest 100
curl "${AUTH[@]}" "$BASE_URL/api/contact"
```

Rate limit: 5 requests / hour per IP.

---

## Newsletter

```bash
curl -X POST "$BASE_URL/api/newsletter" \
  -H "Content-Type: application/json" \
  -d '{"email":"curious@example.com"}'
```

Rate limit: 5 requests / hour per IP. Returns `503` if `MAILCHIMP_API_KEY`/`MAILCHIMP_AUDIENCE_ID` aren't configured.

---

## Support chat

```bash
curl -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"How does the fall detection work?"}]}'
```

No auth (backs a public widget) — rate limit: 20 requests / 5 min per IP. Returns `503` if `ANTHROPIC_API_KEY` isn't configured.

---

## Stripe webhook

Stripe delivers signed events. Forwarding via curl requires the exact raw body and the `Stripe-Signature` header from Stripe. The CLI does this for you:

```bash
# Listen with the Stripe CLI and forward to the local server
stripe listen --forward-to "$BASE_URL/api/stripe/webhook"

# Trigger a test event
stripe trigger checkout.session.completed
```

If you need to POST a hand-crafted event for debugging, build the signature yourself with the Stripe SDK — `req.text()` in the route handler must see the untouched body:

```bash
# Example: signed payload constructed via stripe.webhooks.constructEvent(...)
# Then send raw:
curl -X POST "$BASE_URL/api/stripe/webhook" \
  -H "Stripe-Signature: t=...,v1=..." \
  --data-binary @./payload.json
```

---

## Quick smoke flow

```bash
# 1. Sign in via the web app and capture cookie
export AUTH_COOKIE='sb-...=...'
export DEVICE_KEY='...'

# 2. Confirm session: any authed endpoint should return 200
curl "${AUTH[@]}" "$BASE_URL/api/emergency-contact"

# 3. Trigger an incident as a device
curl "${DEVICE[@]}" -X POST "$BASE_URL/api/incidents/report" \
  -H "Content-Type: application/json" \
  -d '{"lat":14.6,"lng":121.0,"device_id":"dev-uuid-001","incident_type":"SOS Button"}'

# 4. List it back as admin
curl "${AUTH[@]}" "$BASE_URL/api/incidents"

# 5. Mark reported
curl "${AUTH[@]}" -X PATCH "$BASE_URL/api/incident/INCIDENT_UUID/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"reported"}'

# 6. Ping the device
curl "${AUTH[@]}" -X POST "$BASE_URL/api/ping" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"DEVICE_UUID"}'
```

---

## Status codes

| Code | Meaning                                                       |
|------|----------------------------------------------------------------|
| 200  | OK                                                             |
| 201  | Created                                                        |
| 302  | Redirect (auth callback only)                                  |
| 400  | Invalid body — Zod validation failed                           |
| 401  | Unauthenticated/unauthorized — missing session cookie or `X-Device-Key` |
| 403  | Forbidden — role lacks permission for this resource            |
| 404  | Resource not found                                             |
| 429  | Rate limited — back off and retry after the window passes      |
| 500  | Server or upstream (Supabase / Stripe / FCM / Anthropic) failure |
| 502  | Upstream service (FCM / Anthropic / Mailchimp) rejected the request |
| 503  | Endpoint not configured (missing required server env var)      |

Successful responses are JSON: `{ data: ... }` or `{ ok: true }` or `{ received: true }`. Error responses: `{ error: string }` (sometimes with a `details`/`issues` field for validation errors).
