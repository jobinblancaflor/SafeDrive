# Seller Reviews Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a rider who has inquired about a seller leave a 1-5 star review (one per rider per seller, re-submitting updates it); show the average rating + review list on the seller detail page; give staff a hide/unhide action, folded into that same page rather than a new admin page.

**Architecture:** One new table (`seller_reviews`) whose `INSERT` policy enforces eligibility directly in SQL (`exists (select 1 from seller_inquiries ...)`), not just app logic — the same enforcement-not-UI bar as Phase 3. `POST /api/sellers/[id]/reviews` is a rider-only upsert (session client — the row is always the caller's own, so it always passes the table's own `SELECT` policy on `RETURNING`, no service-role client needed). `POST /api/admin/reviews/[id]/hide` is a staff-only toggle. The seller detail page (`app/(authed)/services/[sellerId]/page.tsx`, from Phase 2) gains a reviews section: average + list for everyone, a submit form for eligible riders, and a hide/unhide control for staff — reusing that existing page instead of building `/admin/reviews`.

**Tech Stack:** Next.js 14 App Router (Server + Client Components), Supabase Postgres + RLS, Zod, `lucide-react`'s `Star` icon (already a dependency, used elsewhere via `components/ui/avatar.tsx`), existing `Button`/`Badge` UI components.

**Spec:** `docs/superpowers/specs/2026-08-27-seller-marketplace-design.md` (Phase 4 section)

## Global Constraints

- No test framework in this repo — every task's verification is `npx tsc --noEmit -p .` + `npx eslint <files>` (+ `npm run build` at the end), plus direct Supabase MCP `execute_sql` checks against real data.
- The migration is applied live via Supabase MCP `apply_migration` against project `rsbheplvzouajrjhusfl`, written idempotently (`create table if not exists`, guarded `do $$ ... if not exists ... $$` policy blocks).
- `seller_reviews`' `INSERT` policy is the actual eligibility gate (rider must have an existing `seller_inquiries` row for that seller) — verified against real fixture data, not assumed from the migration source.
- Reviews render anonymously (rating + optional body + date only, no reviewer name): `profiles`' own RLS (`profile self read`) only lets a caller read their own row or an admin read any — a plain rider-to-rider profile join would silently return `null` for the name, so this phase doesn't attempt one. Out of scope for this pass; note it rather than build new profile-read policy surface for it.
- Fixtures already live in the DB: seller `ba3470be-a9f2-4ef6-8559-90883fabf6e8` ("Rico Roadside Assist"), rider `e5e7dae2-dc77-4994-9bd1-9c5543e1ba14` ("aying_lou") with an existing `seller_inquiries` row (id `3b1bcfc9-8f14-4ade-baa2-8f5a9e7e2950`) for that seller — this rider is eligible to review it. A second rider, `32979d08-aca5-41a9-b955-8831fecbe8d8` ("electrohmhaussystems"), has no inquiry for this seller — ineligible, used to verify the gate actually rejects.

---

### Task 1: `seller_reviews` table + RLS

**Files:**
- Create: `supabase/migrations/0019_seller_reviews.sql`

**Interfaces:**
- Produces: `public.seller_reviews` (columns: `id uuid`, `seller_user_id uuid`, `rider_user_id uuid`, `rating smallint` (1-5), `body text` nullable, `hidden_by_admin boolean` default `false`, `created_at timestamptz`), unique on `(seller_user_id, rider_user_id)`.

- [ ] **Step 1: Write the migration file**

```sql
-- 0019_seller_reviews.sql
-- One review per rider per seller (re-submitting updates it). The INSERT
-- policy's `exists (select 1 from seller_inquiries ...)` clause is the
-- actual eligibility enforcement — "only riders who inquired can review,"
-- not just something the API route checks before inserting.

create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  rider_user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text,
  hidden_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists seller_reviews_one_per_rider
  on public.seller_reviews (seller_user_id, rider_user_id);

alter table public.seller_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_reviews' and policyname = 'review rider insert eligible'
  ) then
    create policy "review rider insert eligible" on public.seller_reviews
      for insert with check (
        rider_user_id = auth.uid()
        and exists (
          select 1 from public.seller_inquiries si
          where si.seller_user_id = seller_reviews.seller_user_id
            and si.rider_user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_reviews' and policyname = 'review rider update own'
  ) then
    create policy "review rider update own" on public.seller_reviews
      for update using (rider_user_id = auth.uid()) with check (rider_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_reviews' and policyname = 'review staff update all'
  ) then
    create policy "review staff update all" on public.seller_reviews
      for update using (public.is_staff(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_reviews' and policyname = 'review read visible or own or staff'
  ) then
    create policy "review read visible or own or staff" on public.seller_reviews
      for select using (
        not hidden_by_admin
        or rider_user_id = auth.uid()
        or public.is_staff(auth.uid())
      );
  end if;
end $$;
```

Note on `review rider update own`: this lets the reviewing rider's own upsert (Task 3) update their existing row without a separate admin client, same as `review rider insert eligible` covers first-time submission. It does not column-restrict `hidden_by_admin` — same accepted limitation as `profiles`' "profile self update" policy (see the comment in `app/api/seller/onboarding/complete/route.ts`): a rider crafting a raw request outside the app's own route could theoretically clear a staff hide on their own row. The app's own `POST /api/sellers/[id]/reviews` route (Task 3) never sends `hidden_by_admin` in its upsert payload, so the normal UI path can't trigger this; closing it fully would need a trigger, which is out of scope for this pass.

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `apply_migration` with `project_id: "rsbheplvzouajrjhusfl"`, `name: "seller_reviews"`, `query` set to the exact SQL from Step 1.
Expected: `{"success":true}`.

- [ ] **Step 3: Verify the table + policies live**

```sql
select column_name, data_type from information_schema.columns
where table_name = 'seller_reviews' order by ordinal_position;

select policyname, cmd from pg_policies where tablename = 'seller_reviews' order by policyname;
```
Expected: 6 columns matching Step 1; exactly 4 policies (`review rider insert eligible`, `review rider update own`, `review staff update all`, `review read visible or own or staff`).

- [ ] **Step 4: Seed a review from the eligible fixture and confirm the eligibility gate**

```sql
insert into public.seller_reviews (seller_user_id, rider_user_id, rating, body)
values ('ba3470be-a9f2-4ef6-8559-90883fabf6e8', 'e5e7dae2-dc77-4994-9bd1-9c5543e1ba14', 5, 'Fast tow, very professional.')
returning id, rating, hidden_by_admin;

select exists (
  select 1 from public.seller_inquiries
  where seller_user_id = 'ba3470be-a9f2-4ef6-8559-90883fabf6e8'
    and rider_user_id = '32979d08-aca5-41a9-b955-8831fecbe8d8'
) as ineligible_rider_has_inquiry;
```
Expected: one review row inserted, `hidden_by_admin = false`; second query returns `false` — confirms the ineligible rider (`32979d08-...`) genuinely has no qualifying inquiry, so the same insert attempted as that rider would fail the policy's `exists (...)` clause (this direct-SQL check runs as a bypass-RLS role, so it verifies the *data condition* the policy depends on, not the policy enforcement itself — Task 3's route-level check covers the app-facing behavior since no login session is available in this environment, per the Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_seller_reviews.sql
git commit -m "Add seller_reviews table + RLS (eligibility-gated, Phase 4)"
```

---

### Task 2: `SellerReview` type

**Files:**
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: `type SellerReview = { id: string; seller_user_id: string; rider_user_id: string; rating: number; body: string | null; hidden_by_admin: boolean; created_at: string }`.

- [ ] **Step 1: Add the type**

Add after `SellerInquiry`:

```ts
export type SellerReview = {
  id: string;
  seller_user_id: string;
  rider_user_id: string;
  rating: number;
  body: string | null;
  hidden_by_admin: boolean;
  created_at: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "Add SellerReview type"
```

---

### Task 3: `POST /api/sellers/[id]/reviews`

**Files:**
- Create: `app/api/sellers/[id]/reviews/route.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`.
- Produces: `POST` handler — body `{ rating: 1-5, body?: string }`, 200 with `{ data: SellerReview }` on success (upsert, so both first submission and edit return 200 — no separate "created" semantics to track).

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});

// Rider-only, upsert (one review per rider per seller — re-submitting
// edits it). Eligibility ("only if you've inquired about this seller") is
// enforced by seller_reviews' own INSERT policy, not just this check —
// this route's own lookup exists purely to return a clear 403 instead of
// a raw RLS-denial 500/23514 for the common case.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "rider") {
    return NextResponse.json({ error: "only riders can leave a review" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const sellerUserId = ctx.params.id;
  const { data: inquiry } = await supabase
    .from("seller_inquiries")
    .select("id")
    .eq("seller_user_id", sellerUserId)
    .eq("rider_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!inquiry) {
    return NextResponse.json(
      { error: "Contact us about this seller before leaving a review." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("seller_reviews")
    .upsert(
      {
        seller_user_id: sellerUserId,
        rider_user_id: user.id,
        rating: parsed.data.rating,
        body: parsed.data.body || null,
      },
      { onConflict: "seller_user_id,rider_user_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("sellers/[id]/reviews upsert failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint "app/api/sellers/[id]/reviews/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/sellers/[id]/reviews/route.ts"
git commit -m "Add POST /api/sellers/[id]/reviews (rider-only, eligibility-gated upsert)"
```

---

### Task 4: `POST /api/admin/reviews/[id]/hide`

**Files:**
- Create: `app/api/admin/reviews/[id]/hide/route.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`.
- Produces: `POST` handler — body `{ hidden: boolean }`, staff-only, 200 with `{ ok: true, review: { id, hidden_by_admin } }`.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  hidden: z.boolean(),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "authority") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data, error } = await supabase
    .from("seller_reviews")
    .update({ hidden_by_admin: parsed.data.hidden })
    .eq("id", ctx.params.id)
    .select("id, hidden_by_admin")
    .single();

  if (error) {
    console.error("admin/reviews hide failed:", error);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, review: data });
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint "app/api/admin/reviews/[id]/hide/route.ts"`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/admin/reviews/[id]/hide/route.ts"
git commit -m "Add POST /api/admin/reviews/[id]/hide (staff-only moderation)"
```

---

### Task 5: Review form (client component)

**Files:**
- Create: `components/services/review-form.tsx`

**Interfaces:**
- Consumes: `Button` from `components/ui/button.tsx`, `Star` from `lucide-react`, `SellerReview` from `lib/supabase/types.ts`.
- Produces: `ReviewForm({ sellerUserId: string, existingReview: SellerReview | null })`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SellerReview } from "@/lib/supabase/types";

export function ReviewForm({
  sellerUserId,
  existingReview,
}: {
  sellerUserId: string;
  existingReview: SellerReview | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/sellers/${sellerUserId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, body: body || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? "Could not submit your review.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-white p-4">
      <p className="text-sm font-medium text-slate-900">
        {existingReview ? "Update your review" : "Leave a review"}
      </p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            className="p-0.5"
          >
            <Star
              className={cn("h-6 w-6", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")}
            />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Optional — how did it go?"
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      />
      {error && <p className="text-sm text-status-critical">{error}</p>}
      {done && !error && <p className="text-sm text-status-success">Thanks — your review is posted.</p>}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? "Saving…" : existingReview ? "Update review" : "Submit review"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/services/review-form.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/services/review-form.tsx
git commit -m "Add seller review submission form"
```

---

### Task 6: Review list (with staff hide/unhide)

**Files:**
- Create: `components/services/review-list.tsx`

**Interfaces:**
- Consumes: `Badge` from `components/ui/badge.tsx`, `Star` from `lucide-react`, `formatDateOnly` from `lib/utils.ts`, `SellerReview` from `lib/supabase/types.ts`.
- Produces: `ReviewList({ reviews: SellerReview[], isStaff: boolean })`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly, cn } from "@/lib/utils";
import type { SellerReview } from "@/lib/supabase/types";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("h-4 w-4", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
      ))}
    </div>
  );
}

function HideToggle({ review }: { review: SellerReview }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/admin/reviews/${review.id}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !review.hidden_by_admin }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="text-xs font-medium text-secondary underline-offset-2 hover:underline disabled:opacity-50"
    >
      {review.hidden_by_admin ? "Unhide" : "Hide"}
    </button>
  );
}

export function ReviewList({ reviews, isStaff }: { reviews: SellerReview[]; isStaff: boolean }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-slate-500">No reviews yet.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <div key={review.id} className="rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stars rating={review.rating} />
              <span className="text-xs text-slate-400">{formatDateOnly(review.created_at)}</span>
              {review.hidden_by_admin && <Badge variant="warning">Hidden</Badge>}
            </div>
            {isStaff && <HideToggle review={review} />}
          </div>
          {review.body && <p className="mt-2 text-sm text-slate-600">{review.body}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/services/review-list.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/services/review-list.tsx
git commit -m "Add seller review list with staff hide/unhide"
```

---

### Task 7: Wire reviews into the seller detail page

**Files:**
- Modify: `app/(authed)/services/[sellerId]/page.tsx`

**Interfaces:**
- Consumes: `ReviewList` (Task 6), `ReviewForm` (Task 5), `SellerReview` (Task 2).

- [ ] **Step 1: Replace the placeholder reviews block and add the data fetches**

Replace the `requireProfile()` call with one that also captures the role, add two more queries after the existing seller fetch, and replace the static "No reviews yet." block:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { SellerAreaPreview } from "@/components/services/seller-area-preview";
import { ReviewList } from "@/components/services/review-list";
import { ReviewForm } from "@/components/services/review-form";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import { formatBusinessHours } from "@/lib/business-hours";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import type { SellerDirectoryEntry, SellerReview } from "@/lib/supabase/types";

export default async function SellerDetailPage({ params }: { params: { sellerId: string } }) {
  const profile = await requireProfile();
  const isStaff = profile.role === "admin" || profile.role === "authority";

  const supabase = createClient();
  const { data: seller } = await supabase
    .from("seller_directory")
    .select("*")
    .eq("user_id", params.sellerId)
    .maybeSingle();

  if (!seller) notFound();
  const entry = seller as SellerDirectoryEntry;

  const { data: reviewRows } = await supabase
    .from("seller_reviews")
    .select("*")
    .eq("seller_user_id", entry.user_id)
    .order("created_at", { ascending: false });
  const reviews = (reviewRows ?? []) as SellerReview[];
  const visibleReviews = reviews.filter((r) => !r.hidden_by_admin);
  const averageRating =
    visibleReviews.length > 0
      ? visibleReviews.reduce((sum, r) => sum + r.rating, 0) / visibleReviews.length
      : null;

  let existingReview: SellerReview | null = null;
  let canReview = false;
  if (profile.role === "rider") {
    existingReview = reviews.find((r) => r.rider_user_id === profile.id) ?? null;
    if (existingReview) {
      canReview = true;
    } else {
      const { data: inquiry } = await supabase
        .from("seller_inquiries")
        .select("id")
        .eq("seller_user_id", entry.user_id)
        .eq("rider_user_id", profile.id)
        .limit(1)
        .maybeSingle();
      canReview = Boolean(inquiry);
    }
  }

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

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Reviews</h2>
          {averageRating != null && (
            <span className="text-sm text-slate-500">
              {averageRating.toFixed(1)} / 5 ({visibleReviews.length})
            </span>
          )}
        </div>
        <ReviewList reviews={isStaff ? reviews : visibleReviews} isStaff={isStaff} />
        {profile.role === "rider" &&
          (canReview ? (
            <ReviewForm sellerUserId={entry.user_id} existingReview={existingReview} />
          ) : (
            <p className="text-sm text-slate-500">Contact us about this seller to leave a review.</p>
          ))}
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

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint "app/(authed)/services/[sellerId]/page.tsx"`
Expected: no errors.

- [ ] **Step 3: Verify live**

```sql
select seller_user_id, rider_user_id, rating, hidden_by_admin from public.seller_reviews
where seller_user_id = 'ba3470be-a9f2-4ef6-8559-90883fabf6e8';
```
Expected: the Task 1 fixture review (rating 5, `hidden_by_admin = false`) — confirms the page's unfiltered-by-role query shape returns real data; the page-level `.filter((r) => !r.hidden_by_admin)` is what non-staff viewers actually render.

- [ ] **Step 4: Commit**

```bash
git add "app/(authed)/services/[sellerId]/page.tsx"
git commit -m "Add reviews section to the seller detail page (avg, list, submit, staff hide)"
```

---

## Phase 4 completion check

- [ ] `npx tsc --noEmit -p .` — clean
- [ ] `npx eslint app components lib` — clean
- [ ] `npm run build` — clean, confirm `/api/sellers/[id]/reviews` and `/api/admin/reviews/[id]/hide` both appear in the route list
- [ ] Update `api-docs.json` and `docs/api.json` with both new routes, same shape as the existing entries (established pattern from earlier hardening work and Phase 3)
- [ ] Re-read the spec's Phase 4 section and confirm every bullet has a task above: `seller_reviews` table + RLS-enforced eligibility ✓ Task 1, `POST /api/sellers/[id]/reviews` ✓ Task 3, average rating + review list on the seller detail page ✓ Task 7, staff "hide" action folded into the existing seller detail page rather than a new admin page ✓ Task 4 + Task 6.

Once this passes, the whole 4-phase seller marketplace feature is complete — invoke `finishing-a-development-branch` next (per `executing-plans`' own required next step), not another phase plan.
