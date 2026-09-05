# Seller Onboarding Gate + Marketplace-Lite — Design

Date: 2026-08-27
Status: Approved (defaults locked in chat; revise if any assumption below is wrong)

## Goal

Turn the existing (optional, skippable) seller role + 2-step onboarding wizard into a real gated flow, and build the minimum marketplace loop around it: sellers list their services, riders browse them, riders reach the platform (never the seller directly) to request service, and riders can review a seller they've contacted.

## Non-Goals

- No in-app messaging between rider and seller (contact is platform-mediated only, by design).
- No payments/booking/scheduling — this is a directory + lead-routing system, not a transaction system.
- No admin approval gate before a seller goes live — completing onboarding is the only gate.
- No multi-version service-agreement history — one current agreement version, re-acceptance only if the version string changes (future work).
- No public/anonymous browsing — the whole app is already behind auth; the seller directory is for signed-in riders only.

## Locked decisions (from brainstorming)

- Service catalog is **closed**: `towing`, `battery`, `tire`, `lockout` (lock-picking). Extending it later is a migration, not a settings screen.
- Seller goes live immediately on completing onboarding — no admin approval step.
- Required documents: business permit/license + government ID (2 uploads, private storage, admin-visible only).
- Review eligibility: a rider can review a seller only after submitting an inquiry for that seller.
- Review moderation: visible immediately on submission; admin can hide (soft-delete, not moderation queue).

## Phases

Four sequential sub-projects, each shippable/verifiable on its own:

1. **Onboarding expansion + hard gate** — the foundation; nothing else works without it.
2. **Rider-facing seller directory** — browse-only, depends on (1)'s data.
3. **Contact-us routing** — depends on (2) (need something to inquire about).
4. **Reviews** — depends on (3) (eligibility is gated by having inquired).

---

## Phase 1 — Onboarding expansion + hard gate

### Data model changes

`seller_profiles` (existing table) gains two columns:
```sql
alter table public.seller_profiles
  add column agreement_accepted_at timestamptz,
  add column agreement_version text;
```
`services text[]` already exists on this table — reused as-is, values constrained to the closed catalog by Zod (`z.enum(["towing","battery","tire","lockout"])`) at the API boundary, not a DB check constraint (matches this codebase's existing convention of validating shape in application code).

New table, `seller_documents`:
```sql
create table public.seller_documents (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('business_permit', 'government_id')),
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);
create unique index seller_documents_one_per_type on public.seller_documents (seller_user_id, document_type);
```
One row per document type per seller (re-uploading replaces via upsert-on-conflict, matching the `devices` upsert pattern already used elsewhere). RLS: owner full CRUD on own rows (`user_id = auth.uid()`), staff read-all — same shape as `emergency_contacts`.

New private Supabase Storage bucket `seller_documents` (not public, unlike `profile_images`) — Storage buckets are rows in `storage.buckets`, so this is created in the same Phase 1 migration as the tables above (`insert into storage.buckets (id, name, public) values ('seller_documents', 'seller_documents', false)`), with matching `storage.objects` RLS policies (owner-prefix CRUD, staff read-all) rather than a manual dashboard step. Files at `${sellerUserId}/${documentType}.${ext}`. Signed URLs only, generated on demand for staff review (never a public URL).

### Onboarding wizard — 5 steps (was 2)

Extends `components/onboarding/seller-onboarding-wizard.tsx`:

1. Business details *(existing, unchanged)*
2. **Services offered** *(new)* — checkbox multi-select, the 4 catalog items, at least one required
3. Service area *(existing, unchanged)*
4. **Documents** *(new)* — two file inputs (permit, ID), same client-side validation pattern as the existing avatar upload (type/size checks), uploads directly to Storage via the browser Supabase client (owner RLS allows it), then a metadata row via the existing pattern
5. **Service agreement** *(new)* — static agreement text (hardcoded in the component for v1, not CMS-managed) + a required checkbox, submits `agreement_version` (a hardcoded constant, e.g. `"2026-08-v1"`) and timestamp

`POST /api/seller/onboarding/complete` gains two more required-field checks before promoting the role: at least one document per type uploaded, `agreement_accepted_at` set.

### Hard gate

Currently `app/(public)/page.tsx` redirects an incomplete seller to `/onboarding/seller` only on landing at `/` — deep-linking straight to `/admin/...` or any other authed route bypasses it entirely. Moving the check into `middleware.ts`:

- For any authenticated request where `profile.role === "seller"`, fetch `seller_profiles.onboarding_completed_at` (one lightweight query, only for this role — same cost shape as the existing admin/authority prefix checks already in middleware).
- If incomplete and the path isn't `/onboarding/seller` (or its API routes, or logout), redirect to `/onboarding/seller`.
- Once complete, the seller is unrestricted (same as today — no ongoing route allowlist beyond the existing role system).

### Testing
- typecheck/lint/build clean (established bar for this whole session)
- Manual: a seller account cannot reach `/profile`, `/settings`, etc. by direct URL before completing all 5 steps; can immediately after.

---

## Phase 2 — Rider-facing seller directory

- New route `/services` (list) — server component, staff/seller excluded (rider + seller can browse, actually — no strong reason to exclude sellers from seeing competitors; keep simple, any authenticated role can view), filterable by service type via query param, shows sellers whose `onboarding_completed_at` is set.
- New route `/services/[sellerId]` (detail) — business name, hours, services, service-area map (reuse the existing Leaflet area-picker in read-only mode), aggregate review rating (Phase 4 — shows "no reviews yet" until then). **No contact info of any kind rendered** — the only action is "Request this service" → Phase 3.
- No document data ever reaches this view (staff-only, via a separate admin page — out of scope for v1, documents are fetched ad hoc via Supabase dashboard/SQL until an admin UI is worth building).

### Testing
- typecheck/lint/build clean
- Manual: directory only lists onboarding-complete sellers; filtering by service type narrows correctly.

---

## Phase 3 — Contact-us routing

New table, `seller_inquiries`:
```sql
create table public.seller_inquiries (
  id uuid primary key default gen_random_uuid(),
  rider_user_id uuid not null references public.profiles(id) on delete cascade,
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  service_type text not null check (service_type in ('towing','battery','tire','lockout')),
  message text not null,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);
```
RLS: rider can insert/read own rows (`rider_user_id = auth.uid()`); staff can read/update all (to work the queue, change status); **seller has no read access at all** — this is the enforcement point for "never contact the seller directly," not just a UI omission.

- `POST /api/seller-inquiries` — rider-only, body `{ seller_user_id, service_type, message }`.
- `/admin/inquiries` — new staff page, table view + status update, same shape as the existing `/admin/settings` contact-submissions list.
- Rider's "Request this service" button (Phase 2's detail page) opens a small form, posts here — copy explicitly states this goes to Secure Signal, not the seller.

### Testing
- typecheck/lint/build clean
- Manual: a seller session cannot read `seller_inquiries` at all (RLS-level check, not just hidden UI); rider can submit and sees only their own.

---

## Phase 4 — Reviews

New table, `seller_reviews`:
```sql
create table public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  rider_user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  hidden_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index seller_reviews_one_per_rider on public.seller_reviews (seller_user_id, rider_user_id);
```
One review per rider per seller (re-submitting updates it). RLS insert policy enforces eligibility directly in SQL (`with check`), not just app-level: `exists (select 1 from seller_inquiries where seller_user_id = new.seller_user_id and rider_user_id = auth.uid())`. Read: any authenticated user can read non-hidden reviews; staff can read all (including hidden, for moderation); rider can update/delete their own.

- `POST /api/sellers/[id]/reviews` — rider-only, `{ rating, body }`.
- Seller detail page (Phase 2) renders the average rating + review list.
- `/admin/...` gets a "hide" action on a review (sets `hidden_by_admin`) — folded into the existing admin surface rather than a new page.

### Testing
- typecheck/lint/build clean
- Manual: a rider who never inquired gets rejected at the RLS layer (not just the UI) attempting to review; one review per rider per seller enforced.

---

## Cross-cutting

- All new tables follow this session's established RLS pattern (owner CRUD + staff read-all via `is_staff(auth.uid())`), verified against the actual live schema via Supabase MCP before relying on any assumption, the same discipline used throughout this session's earlier work.
- All new API routes are session-authenticated (rider/seller/staff) — none of this is device-facing, so none of it needs `X-Device-Key` or the rate-limit table; standard Supabase session client is correct throughout, not the service-role client (that was specifically for anonymous device requests).
- Migrations applied via the Supabase MCP `apply_migration` tool against the live project (`rsbheplvzouajrjhusfl`), same as every migration this session — not left as unapplied files.
