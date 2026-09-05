# Seller Directory Phase 2 (Rider-Facing Browse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any signed-in user browse onboarding-complete sellers (filterable by service type) and view a single seller's detail page, with zero contact information exposed — Phase 3 will add the actual "request this service" flow.

**Architecture:** A new Postgres view (`seller_directory`) is the sole read surface riders/staff use — it excludes `contact_phone`/`contact_email`/`agreement_*` entirely at the database layer, so there's no code path (UI omission or otherwise) that could leak them, matching the same enforcement-not-just-UI bar Phase 3 uses for inquiries. Two new server-component pages (`/services`, `/services/[sellerId]`) query it directly with the normal session client — no new API routes needed, this is read-only.

**Tech Stack:** Next.js 14 App Router (Server Components), Supabase Postgres view + `@supabase/ssr` session client, existing `Card`/`Badge` UI components, existing `SellerAreaMap` (Leaflet) reused read-only.

**Spec:** `docs/superpowers/specs/2026-08-27-seller-marketplace-design.md` (Phase 2 section)

## Global Constraints

- No test framework in this repo — every task's verification is `npx tsc --noEmit -p .` + `npx eslint <files>` (+ `npm run build` at the end), plus direct Supabase MCP `execute_sql` checks against real data where a route/page can't be click-tested live (no login session available in this environment — same constraint as Phase 1).
- The migration is applied live via Supabase MCP `apply_migration` against project `rsbheplvzouajrjhusfl`, written idempotently (`create or replace view`, `drop policy if exists` before `create policy` where applicable) — Phase 1 found that untracked schema can silently disappear, so every migration in this feature goes through `apply_migration`, never bare `execute_sql`, from here on.
- `seller_directory` is granted to the `authenticated` Postgres role only, never `anon` — the spec is explicit that there's no public/anonymous browsing.
- This phase touches no middleware and no RLS on `seller_profiles`/`seller_documents` — Phase 1's owner+staff-only policies on those tables are untouched; the view is the only new access path.

---

### Task 1: `seller_directory` view

**Files:**
- Create: `supabase/migrations/0017_seller_directory_view.sql`

**Interfaces:**
- Produces: `public.seller_directory` (columns: `user_id uuid`, `business_name text`, `services text[]`, `business_hours jsonb`, `area_label text`, `area_lat double precision`, `area_lng double precision`, `area_radius_meters integer`, `onboarding_completed_at timestamptz`), granted `SELECT` to `authenticated`.

- [ ] **Step 1: Write the migration file**

```sql
-- 0017_seller_directory_view.sql
-- Read-only, redacted view of seller_profiles for the rider-facing
-- directory (Phase 2). Deliberately excludes contact_phone, contact_email,
-- and the agreement_* columns — this is the actual enforcement point for
-- "riders never see seller contact info," not just a UI omission (same
-- bar Phase 3 uses for seller_inquiries: seller_profiles' own RLS stays
-- owner+staff-only; this view is a separate, narrower surface).
--
-- A plain view (no `security_invoker`) evaluates using its owner's
-- privileges against the base table — since migrations run as a role that
-- bypasses RLS, this view's own WHERE clause and column list are the
-- entire access-control surface, not seller_profiles' RLS policies.

create or replace view public.seller_directory as
select
  sp.user_id,
  sp.business_name,
  sp.services,
  sp.business_hours,
  sp.area_label,
  sp.area_lat,
  sp.area_lng,
  sp.area_radius_meters,
  sp.onboarding_completed_at
from public.seller_profiles sp
where sp.onboarding_completed_at is not null;

grant select on public.seller_directory to authenticated;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `apply_migration` with `project_id: "rsbheplvzouajrjhusfl"`, `name: "seller_directory_view"`, `query` set to the exact SQL from Step 1.
Expected: `{"success":true}`.

- [ ] **Step 3: Verify the view live**

```sql
select column_name, data_type from information_schema.columns
where table_name = 'seller_directory' order by ordinal_position;

select has_table_privilege('authenticated', 'public.seller_directory', 'SELECT') as authenticated_can_select,
       has_table_privilege('anon', 'public.seller_directory', 'SELECT') as anon_can_select;

select * from public.seller_directory;
```
Expected: 9 columns, none of them `contact_phone`/`contact_email`/`agreement_accepted_at`/`agreement_version`; `authenticated_can_select = true`, `anon_can_select = false`; zero rows (Task 1 of Phase 1 seeded a complete `seller_profiles` row for the test account, but `onboarding_completed_at` is still null there — confirmed empty here is correct).

- [ ] **Step 4: Seed a second fixture and re-verify the view actually returns rows**

An empty view only proves the filter *excludes* incomplete sellers — also confirm it *includes* a complete one. Stamp the existing test fixture's `onboarding_completed_at` (this is exactly what `POST /api/seller/onboarding/complete` would have set, had it been reachable without a login session):

```sql
update public.seller_profiles
set onboarding_completed_at = now()
where user_id = 'ba3470be-a9f2-4ef6-8559-90883fabf6e8';

select user_id, business_name, services, contact_phone, agreement_accepted_at
from public.seller_directory
where user_id = 'ba3470be-a9f2-4ef6-8559-90883fabf6e8';
```
Expected: one row; selecting `contact_phone`/`agreement_accepted_at` from the *view* is a column that doesn't exist (query errors) — that error is the actual proof those fields are unreachable through this surface, not just absent from a hand-picked column list. Re-run without those two columns to confirm the row itself is visible:
```sql
select user_id, business_name, services from public.seller_directory
where user_id = 'ba3470be-a9f2-4ef6-8559-90883fabf6e8';
```
Expected: `{"user_id": "ba3470be-a9f2-4ef6-8559-90883fabf6e8", "business_name": "Rico Roadside Assist", "services": ["towing","battery"]}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_seller_directory_view.sql
git commit -m "Add seller_directory view (redacted, rider-visible seller listing)"
```

---

### Task 2: Directory types + business-hours formatter

**Files:**
- Modify: `lib/supabase/types.ts`
- Create: `lib/business-hours.ts`

**Interfaces:**
- Consumes: `BusinessHours` from `lib/supabase/types.ts` (existing, from Phase 1's precursor work).
- Produces: `type SellerDirectoryEntry = { user_id: string; business_name: string | null; services: string[]; business_hours: BusinessHours; area_label: string | null; area_lat: number | null; area_lng: number | null; area_radius_meters: number | null; onboarding_completed_at: string }`; `function formatBusinessHours(hours: BusinessHours): { day: string; label: string; text: string }[]`.

- [ ] **Step 1: Add `SellerDirectoryEntry` to `lib/supabase/types.ts`**

Add after the existing `SellerDocument` type:

```ts
export type SellerDirectoryEntry = {
  user_id: string;
  business_name: string | null;
  services: string[];
  business_hours: BusinessHours;
  area_label: string | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_meters: number | null;
  onboarding_completed_at: string;
};
```

- [ ] **Step 2: Write the business-hours formatter**

```ts
// lib/business-hours.ts
import type { BusinessHours } from "@/lib/supabase/types";

const DAY_ORDER: { key: keyof BusinessHours; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

function to12Hour(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minuteStr} ${period}`;
}

export function formatBusinessHours(hours: BusinessHours): { day: string; label: string; text: string }[] {
  return DAY_ORDER.map(({ key, label }) => {
    const day = hours[key];
    if (!day || day.closed) {
      return { day: key, label, text: "Closed" };
    }
    return { day: key, label, text: `${to12Hour(day.open)} – ${to12Hour(day.close)}` };
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/types.ts lib/business-hours.ts
git commit -m "Add SellerDirectoryEntry type and business-hours formatter"
```

---

### Task 3: Read-only service-area map preview

**Files:**
- Create: `components/services/seller-area-preview.tsx`

**Interfaces:**
- Consumes: `SellerAreaMap` from `components/onboarding/seller-area-map.tsx` (existing, unmodified — takes `{ center: LatLng, radiusMeters: number, onMove: (p: LatLng) => void }`).
- Produces: `SellerAreaPreview({ center: LatLng, radiusMeters: number })`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { SellerAreaMap } from "@/components/onboarding/seller-area-map";
import type { LatLng } from "@/lib/incident-geo";

// Read-only: SellerAreaMap is normally interactive (drag/click to move the
// center), built for the onboarding step where the seller sets their own
// location. Passing a no-op onMove means a drag or click still fires the
// handler internally but nothing re-renders in response, so the marker
// stays put — reused as-is rather than adding a new prop to the shared
// component for one read-only caller.
export function SellerAreaPreview({ center, radiusMeters }: { center: LatLng; radiusMeters: number }) {
  return (
    <div className="h-[300px]">
      <SellerAreaMap center={center} radiusMeters={radiusMeters} onMove={() => {}} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/services/seller-area-preview.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/services/seller-area-preview.tsx
git commit -m "Add read-only service-area map preview for the seller directory"
```

---

### Task 4: Seller card (list item)

**Files:**
- Create: `components/services/seller-card.tsx`

**Interfaces:**
- Consumes: `SellerDirectoryEntry` from `lib/supabase/types.ts` (Task 2), `SELLER_SERVICE_META` from `lib/seller-service-type.ts` (Phase 1).
- Produces: `SellerCard({ seller: SellerDirectoryEntry })`.

- [ ] **Step 1: Write the file**

```tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";

export function SellerCard({ seller }: { seller: SellerDirectoryEntry }) {
  return (
    <Link href={`/services/${seller.user_id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>{seller.business_name ?? "Unnamed business"}</CardTitle>
          {seller.area_label && <CardDescription>{seller.area_label}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 pt-0">
          {seller.services.filter(isSellerServiceType).map((type) => (
            <Badge key={type} variant="secondary">
              {SELLER_SERVICE_META[type].label}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/services/seller-card.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/services/seller-card.tsx
git commit -m "Add seller directory card component"
```

---

### Task 5: Directory list page

**Files:**
- Create: `app/(authed)/services/page.tsx`

**Interfaces:**
- Consumes: `SellerCard` (Task 4), `SellerDirectoryEntry` (Task 2), `SELLER_SERVICE_OPTIONS`/`SELLER_SERVICE_META`/`isSellerServiceType` from `lib/seller-service-type.ts` (Phase 1), `requireProfile` from `lib/rbac.ts` (existing), `createClient` from `lib/supabase/server.ts` (existing).

- [ ] **Step 1: Write the file**

```tsx
import Link from "next/link";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { SellerCard } from "@/components/services/seller-card";
import { SELLER_SERVICE_META, SELLER_SERVICE_OPTIONS, isSellerServiceType } from "@/lib/seller-service-type";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { service?: string };
}) {
  await requireProfile();

  const activeFilter = isSellerServiceType(searchParams.service) ? searchParams.service : null;

  const supabase = createClient();
  let query = supabase.from("seller_directory").select("*").order("business_name");
  if (activeFilter) {
    query = query.contains("services", [activeFilter]);
  }
  const { data: sellers } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Roadside assistance services</h1>
        <p className="text-sm text-slate-500">
          Browse registered sellers near you. To request a service, contact Secure Signal — not the seller directly.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/services"
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            !activeFilter ? "border-secondary bg-secondary text-white" : "border-slate-200 text-slate-600",
          )}
        >
          All
        </Link>
        {SELLER_SERVICE_OPTIONS.map((type) => (
          <Link
            key={type}
            href={`/services?service=${type}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              activeFilter === type ? "border-secondary bg-secondary text-white" : "border-slate-200 text-slate-600",
            )}
          >
            {SELLER_SERVICE_META[type].label}
          </Link>
        ))}
      </div>

      {sellers && sellers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(sellers as SellerDirectoryEntry[]).map((seller) => (
            <SellerCard key={seller.user_id} seller={seller} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500">
          No sellers match yet.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint "app/(authed)/services/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Verify the query live**

```sql
select business_name, services from public.seller_directory;
select business_name, services from public.seller_directory where services @> array['towing'];
```
Expected: the "Rico Roadside Assist" row in both (it offers `towing`), confirming the page's unfiltered query and its `.contains(services, ['towing'])` filter (PostgREST's `.contains()` compiles to `@>`) both return it.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/services/page.tsx"
git commit -m "Add rider-facing seller directory list page"
```

---

### Task 6: Seller detail page

**Files:**
- Create: `app/(authed)/services/[sellerId]/page.tsx`

**Interfaces:**
- Consumes: `SellerAreaPreview` (Task 3), `formatBusinessHours` (Task 2), `SELLER_SERVICE_META`/`isSellerServiceType` (Phase 1), `SellerDirectoryEntry` (Task 2), `DEFAULT_CENTER` from `lib/map-constants.ts` (existing).

- [ ] **Step 1: Write the file**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { SellerAreaPreview } from "@/components/services/seller-area-preview";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import { formatBusinessHours } from "@/lib/business-hours";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";

export default async function SellerDetailPage({ params }: { params: { sellerId: string } }) {
  await requireProfile();

  const supabase = createClient();
  const { data: seller } = await supabase
    .from("seller_directory")
    .select("*")
    .eq("user_id", params.sellerId)
    .maybeSingle();

  if (!seller) notFound();
  const entry = seller as SellerDirectoryEntry;

  const center =
    entry.area_lat != null && entry.area_lng != null
      ? { lat: entry.area_lat, lng: entry.area_lng }
      : DEFAULT_CENTER;
  const radiusMeters = entry.area_radius_meters ?? 10_000;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{entry.business_name ?? "Unnamed business"}</h1>
        {entry.area_label && <p className="text-sm text-slate-500">{entry.area_label}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {entry.services.filter(isSellerServiceType).map((type) => (
          <Badge key={type} variant="secondary">
            {SELLER_SERVICE_META[type].label}
          </Badge>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Business hours</h2>
        <dl className="space-y-1 text-sm">
          {formatBusinessHours(entry.business_hours).map(({ day, label, text }) => (
            <div key={day} className="flex justify-between text-slate-600">
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Service area</h2>
        <SellerAreaPreview center={center} radiusMeters={radiusMeters} />
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Reviews</h2>
        <p className="text-sm text-slate-500">No reviews yet.</p>
      </div>

      <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4">
        <p className="text-sm text-slate-700">
          Requests go through Secure Signal — we&apos;ll never share your contact details with the seller directly
          until you choose to.
        </p>
        <Link
          href={`/services/${entry.user_id}/request`}
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Request this service
        </Link>
      </div>
    </div>
  );
}
```

`components/ui/button.tsx`'s `Button` is a plain `<button>` wrapper (`ButtonHTMLAttributes`, no Radix `Slot`/`asChild` support) — using it to wrap a `<Link>` would nest an `<a>` inside a `<button>`, which is invalid HTML. The classes above are copied from `buttonVariants`' `default` variant + `size: "default"` so this reads as a normal button despite being a link.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint "app/(authed)/services/[sellerId]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Verify live**

```sql
select user_id, business_name from public.seller_directory where user_id = 'ba3470be-a9f2-4ef6-8559-90883fabf6e8';
select user_id from public.seller_directory where user_id = '00000000-0000-0000-0000-000000000000';
```
Expected: first query returns the fixture (proves the page's `.eq("user_id", params.sellerId).maybeSingle()` will resolve a real row); second returns nothing (proves an unknown id resolves to `null` → the page's `notFound()` branch, which Next.js renders as its built-in 404 — this is the same pattern already used by `app/(authed)/monitor/[incident_id]/page.tsx` elsewhere in this codebase).

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/services/[sellerId]/page.tsx"
git commit -m "Add seller detail page (no contact info, request button stubbed for Phase 3)"
```

---

## Phase 2 completion check

- [ ] `npx tsc --noEmit -p .` — clean
- [ ] `npx eslint app components lib` — clean
- [ ] `npm run build` — clean, confirm `/services` and `/services/[sellerId]` both appear in the route list
- [ ] Re-read the spec's Phase 2 section and confirm every bullet has a task above: listing filterable by service type ✓ Task 5, detail page with business info/hours/area/reviews-placeholder ✓ Task 6, no contact info exposed ✓ Task 1 (view excludes it at the DB layer, not just the UI), "Request this service" action present but not wired ✓ Task 6.

Once this passes, Phase 3 (contact-us routing) gets its own plan the same way — do not start writing Phase 3 code inside this plan's tasks.
