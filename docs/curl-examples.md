# Secure Signal Admin — cURL Examples

Working cURL commands for every API endpoint. Run against a local dev server (`npm run dev`) or any deployed instance by changing `BASE_URL`.

```bash
export BASE_URL="http://localhost:3000"
```

## Authentication

Authed endpoints rely on the Supabase session cookie (`sb-<project>-auth-token`). Two ways to set it:

1. Sign in via the web app, then copy the cookie value from DevTools → Application → Cookies.
2. Use Supabase directly to mint a token, then pass it.

```bash
# Sample — replace with your real cookie
export AUTH_COOKIE='sb-abcdefgh-auth-token=eyJhbGciOiJIUzI1NiIs...'

# Helper flag for all examples below:
AUTH=(-H "Cookie: $AUTH_COOKIE")
```

Every example below uses `${AUTH[@]}` when the endpoint requires a session.

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

## Incidents

```bash
# Device-side ingestion — anonymous, no auth
curl -X POST "$BASE_URL/api/incident" \
  -H "Content-Type: application/json" \
  -d '{"lng":121.0,"lat":14.6,"device_uuid":"dev-uuid-001"}'

# List incidents for a date (admin/authority only) — UTC date, returns up to 500
curl "${AUTH[@]}" "$BASE_URL/api/incident?date=2026-07-27"

# List most recent (no date filter)
curl "${AUTH[@]}" "$BASE_URL/api/incident"

# Fetch one incident
curl "${AUTH[@]}" "$BASE_URL/api/incident/INCIDENT_UUID"

# Mark an incident reported (admin/authority)
curl "${AUTH[@]}" -X PATCH "$BASE_URL/api/incident/INCIDENT_UUID/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"reported"}'

# Reopen an incident (received again)
curl "${AUTH[@]}" -X PATCH "$BASE_URL/api/incident/INCIDENT_UUID/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"received"}'
```

---

## Incident live tracking (breadcrumb trail)

```bash
# Device posts a location breadcrumb while the incident is active — anonymous, no auth
curl -X POST "$BASE_URL/api/incident/INCIDENT_UUID/track" \
  -H "Content-Type: application/json" \
  -d '{"lat":14.6,"lng":121.0,"device_uuid":"dev-uuid-001"}'

# Staff reads the most recent 100 points (admin/authority only)
curl "${AUTH[@]}" "$BASE_URL/api/incident/INCIDENT_UUID/track"
```

---

## Ping

```bash
# Send a ping (admin/authority) — inserts a pings row + best-effort FCM push
curl "${AUTH[@]}" -X POST "$BASE_URL/api/ping" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"DEVICE_UUID"}'

# Device callback — mark ping received
curl -X PATCH "$BASE_URL/api/ping" \
  -H "Content-Type: application/json" \
  -d '{"ping_id":"PING_UUID"}'
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

# 2. Confirm session: any authed endpoint should return 200
curl "${AUTH[@]}" "$BASE_URL/api/emergency-contact"

# 3. Trigger an incident as a device
curl -X POST "$BASE_URL/api/incident" \
  -H "Content-Type: application/json" \
  -d '{"lng":121.0,"lat":14.6,"device_uuid":"dev-uuid-001"}'

# 4. List it back as admin
curl "${AUTH[@]}" "$BASE_URL/api/incident"

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

| Code | Meaning                                                |
|------|--------------------------------------------------------|
| 200  | OK                                                     |
| 201  | Created                                                |
| 302  | Redirect (auth callback only)                          |
| 400  | Invalid body — Zod validation failed                   |
| 401  | Unauthenticated — set the Supabase session cookie      |
| 403  | Forbidden — role lacks permission for this resource    |
| 404  | Resource not found                                      |
| 500  | Server or upstream (Supabase / Stripe / FCM) failure   |

Successful responses are JSON: `{ data: ... }` or `{ ok: true }` or `{ received: true }`. Error responses: `{ error: string }`.