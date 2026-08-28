# Seller Inquiries Phase 3 (Contact-Us Routing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a rider request a service from a seller listed in the directory without ever reaching the seller directly — the request lands in a `seller_inquiries` table that only the rider (their own rows) and staff can read; the seller has no read access at all, enforced by RLS, not UI omission.

**Architecture:** One new table (`seller_inquiries`) with RLS as the sole enforcement point for "never contact the seller directly." A rider-only `POST /api/seller-inquiries` route creates the row (session client — RLS's own insert/select policies cover the caller, no service-role client needed here). A new `/services/[sellerId]/request` page + client form component wires up the button Phase 2 already stubbed. A new `/admin/inquiries` staff page (list + inline status change) mirrors the existing `/admin/settings` contact-submissions list, plus a small staff-only status-update API route.

**Tech Stack:** Next.js 14 App Router (Server + Client Components), Supabase Postgres + RLS, Zod for API body validation, existing `Table`/`Card`/`Badge`/`Button`/`Input` UI components.

**Spec:** `docs/superpowers/specs/2026-08-27-seller-marketplace-design.md` (Phase 3 section)

## Global Constraints

- No test framework in this repo — every task's verification is `npx tsc --noEmit -p .` + `npx eslint <files>` (+ `npm run build` at the end), plus direct Supabase MCP `execute_sql` checks against real data (no login session available in this environment).
- The migration is applied live via Supabase MCP `apply_migration` against project `rsbheplvzouajrjhusfl`, written idempotently (`create table if not exists`, guarded `do $$ ... if not exists ... $$` policy blocks) — every migration in this feature goes through `apply_migration`, never bare `execute_sql`.
- `seller_inquiries` grants no policy at all to the `seller` role — this is the actual enforcement point for "riders can't contact sellers directly," verified via `pg_policies`, not assumed from the migration source alone.
- All new API routes are session-authenticated (rider or staff) — none of this is device-facing, so none of it needs `X-Device-Key` or the rate-limit table; standard Supabase session client throughout.
- Test fixtures already live in the DB: seller `ba3470be-a9f2-4ef6-8559-90883fabf6e8` ("Rico Roadside Assist", onboarding-complete, listed in `seller_directory`), rider `e5e7dae2-dc77-4994-9bd1-9c5543e1ba14` ("aying_lou").

---

### Task 1: `seller_inquiries` table + RLS

**Files:**
- Create: `supabase/migrations/0018_seller_inquiries.sql`

**Interfaces:**
- Produces: `public.seller_inquiries` (columns: `id uuid`, `rider_user_id uuid`, `seller_user_id uuid`, `service_type text`, `message text`, `status text` default `'new'`, `created_at timestamptz`). RLS: rider insert/read own rows; staff (`is_staff`) read/update all; seller — no policy, no access.

- [ ] **Step 1: Write the migration file**

```sql
-- 0018_seller_inquiries.sql
-- Contact-us routing (Phase 3): a rider's request for a seller's service
-- goes here, not to the seller. RLS is the actual enforcement of "never
-- contact the seller directly" — the seller role has NO policy on this
-- table at all, so even a compromised or buggy UI can't leak it to them.

create table if not exists public.seller_inquiries (
  id uuid primary key default gen_random_uuid(),
  rider_user_id uuid not null references public.profiles(id) on delete cascade,
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  service_type text not null check (service_type in ('towing','battery','tire','lockout')),
  message text not null,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now()
);

alter table public.seller_inquiries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_inquiries' and policyname = 'inquiry rider insert own'
  ) then
    create policy "inquiry rider insert own" on public.seller_inquiries
      for insert with check (rider_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_inquiries' and policyname = 'inquiry rider read own'
  ) then
    create policy "inquiry rider read own" on public.seller_inquiries
      for select using (rider_user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_inquiries' and policyname = 'inquiry staff read all'
  ) then
    create policy "inquiry staff read all" on public.seller_inquiries
      for select using (public.is_staff(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'seller_inquiries' and policyname = 'inquiry staff update all'
  ) then
    create policy "inquiry staff update all" on public.seller_inquiries
      for update using (public.is_staff(auth.uid()));
  end if;
end $$;
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `apply_migration` with `project_id: "rsbheplvzouajrjhusfl"`, `name: "seller_inquiries"`, `query` set to the exact SQL from Step 1.
Expected: `{"success":true}`.

- [ ] **Step 3: Verify the table + policies live**

```sql
select column_name, data_type from information_schema.columns
where table_name = 'seller_inquiries' order by ordinal_position;

select policyname, cmd, roles from pg_policies where tablename = 'seller_inquiries' order by policyname;
```
Expected: 7 columns matching Step 1; exactly 4 policies (`inquiry rider insert own`, `inquiry rider read own`, `inquiry staff read all`, `inquiry staff update all`) — no policy referencing `seller_user_id = auth.uid()` or any seller-side read, confirming a seller session (which only satisfies `rider_user_id = auth.uid()` never being true for their own id-as-seller row, and `is_staff` being false) matches zero policies and gets zero rows back.

- [ ] **Step 4: Seed a test inquiry and confirm ownership scoping**

```sql
insert into public.seller_inquiries (rider_user_id, seller_user_id, service_type, message)
values ('e5e7dae2-dc77-4994-9bd1-9c5543e1ba14', 'ba3470be-a9f2-4ef6-8559-90883fabf6e8', 'towing', 'Car broke down near the mall, need a tow.')
returning id, rider_user_id, seller_user_id, service_type, status;
```
Expected: one row, `status = 'new'`. Keep the returned `id` — Phase 4 reuses this exact inquiry as the review-eligibility fixture.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_seller_inquiries.sql
git commit -m "Add seller_inquiries table + RLS (contact-us routing, Phase 3)"
```

---

### Task 2: `SellerInquiry` type

**Files:**
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: `type InquiryStatus = "new" | "contacted" | "closed"`; `type SellerInquiry = { id: string; rider_user_id: string; seller_user_id: string; service_type: string; message: string; status: InquiryStatus; created_at: string }`.

- [ ] **Step 1: Add the type**

Add after `SellerDirectoryEntry`:

```ts
export type InquiryStatus = "new" | "contacted" | "closed";

export type SellerInquiry = {
  id: string;
  rider_user_id: string;
  seller_user_id: string;
  service_type: string;
  message: string;
  status: InquiryStatus;
  created_at: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "Add SellerInquiry type"
```

---

### Task 3: `POST /api/seller-inquiries`

**Files:**
- Create: `app/api/seller-inquiries/route.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts`, `SELLER_SERVICE_OPTIONS` from `lib/seller-service-type.ts`.
- Produces: `POST` handler — body `{ seller_user_id: string, service_type: SellerServiceType, message: string }`, 201 with `{ data: SellerInquiry }` on success.

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SELLER_SERVICE_OPTIONS } from "@/lib/seller-service-type";

const Body = z.object({
  seller_user_id: z.string().uuid(),
  service_type: z.enum(SELLER_SERVICE_OPTIONS as [string, ...string[]]),
  message: z.string().trim().min(1).max(2000),
});

// Rider-only: creates a lead routed to Secure Signal staff, never to the
// seller — seller_inquiries' RLS has no seller-readable policy at all, so
// this is enforced at the database layer, not just by who this route lets
// call it.
export async function POST(req: Request) {
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
    return NextResponse.json({ error: "only riders can request a service" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data: seller } = await supabase
    .from("seller_directory")
    .select("user_id")
    .eq("user_id", parsed.data.seller_user_id)
    .maybeSingle();
  if (!seller) {
    return NextResponse.json({ error: "seller not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("seller_inquiries")
    .insert({
      rider_user_id: user.id,
      seller_user_id: parsed.data.seller_user_id,
      service_type: parsed.data.service_type,
      message: parsed.data.message,
    })
    .select()
    .single();

  if (error) {
    console.error("seller-inquiries insert failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
```

Note on why this doesn't need the service-role client (unlike several device-facing routes earlier this session): the caller is always the rider themselves, and `seller_inquiries`' own `SELECT` policy (`rider_user_id = auth.uid()`) always matches the row they just inserted — the RLS-gates-RETURNING pitfall only bites when the writer isn't guaranteed to pass the table's SELECT policy, which isn't the case here.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint app/api/seller-inquiries/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/seller-inquiries/route.ts
git commit -m "Add POST /api/seller-inquiries (rider-only contact-us request)"
```

---

### Task 4: Request form page (wires up Phase 2's stubbed button)

**Files:**
- Create: `components/services/inquiry-form.tsx`
- Create: `app/(authed)/services/[sellerId]/request/page.tsx`

**Interfaces:**
- Consumes: `SELLER_SERVICE_META`/`SELLER_SERVICE_OPTIONS`/`isSellerServiceType` from `lib/seller-service-type.ts`, `SellerDirectoryEntry` from `lib/supabase/types.ts`, `requireRole` from `lib/rbac.ts`, `createClient` from `lib/supabase/server.ts`.
- Produces: `InquiryForm({ sellerUserId: string, sellerName: string })` (client component, posts to `/api/seller-inquiries`).

- [ ] **Step 1: Write the client form**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SELLER_SERVICE_META, SELLER_SERVICE_OPTIONS, type SellerServiceType } from "@/lib/seller-service-type";

export function InquiryForm({ sellerUserId, sellerName }: { sellerUserId: string; sellerName: string }) {
  const router = useRouter();
  const [serviceType, setServiceType] = useState<SellerServiceType>(SELLER_SERVICE_OPTIONS[0]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/seller-inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller_user_id: sellerUserId, service_type: serviceType, message }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? "Could not send your request.");
      return;
    }
    setSent(true);
    setTimeout(() => router.push("/services"), 1500);
  }

  if (sent) {
    return (
      <div className="rounded-lg border bg-status-success/10 p-4 text-sm text-status-success">
        Request sent to Secure Signal. We&apos;ll reach out to arrange {sellerName}&apos;s service.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Service needed</label>
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as SellerServiceType)}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          {SELLER_SERVICE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {SELLER_SERVICE_META[type].label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tell us what's going on</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={1}
          maxLength={2000}
          rows={4}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          placeholder="Location, vehicle details, anything the team should know."
        />
      </div>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Sending…" : "Send to Secure Signal"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

```tsx
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { InquiryForm } from "@/components/services/inquiry-form";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";

export default async function RequestServicePage({ params }: { params: { sellerId: string } }) {
  await requireRole(["rider"]);

  const supabase = createClient();
  const { data: seller } = await supabase
    .from("seller_directory")
    .select("*")
    .eq("user_id", params.sellerId)
    .maybeSingle();

  if (!seller) notFound();
  const entry = seller as SellerDirectoryEntry;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request service</h1>
        <p className="text-sm text-slate-500">
          For {entry.business_name ?? "this seller"}. Secure Signal handles the request — the seller never sees your
          contact details.
        </p>
      </div>
      <InquiryForm sellerUserId={entry.user_id} sellerName={entry.business_name ?? "this seller"} />
    </div>
  );
}
```

`requireRole(["rider"])` rather than `requireProfile()`: the spec's inquiry flow is rider-only (Phase 2's directory itself stays open to any authenticated role, but *requesting* is rider-only, matching `POST /api/seller-inquiries`'s own check).

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/services/inquiry-form.tsx "app/(authed)/services/[sellerId]/request/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/services/inquiry-form.tsx "app/(authed)/services/[sellerId]/request/page.tsx"
git commit -m "Wire up the seller-directory request-service flow"
```

---

### Task 5: Staff inquiries queue

**Files:**
- Create: `app/api/admin/inquiries/[id]/status/route.ts`
- Create: `components/admin/inquiry-status-select.tsx`
- Create: `app/(authed)/admin/inquiries/page.tsx`

**Interfaces:**
- Consumes: `requireRole` from `lib/rbac.ts`, `createClient` (server) from `lib/supabase/server.ts`, `createClient` (browser) from `lib/supabase/client.ts`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `components/ui/table.tsx`, `Badge` from `components/ui/badge.tsx`, `formatDate` from `lib/utils.ts`, `SellerInquiry`/`InquiryStatus` from `lib/supabase/types.ts`.
- Produces: `POST /api/admin/inquiries/[id]/status` (staff-only, body `{ status: InquiryStatus }`); `InquiryStatusSelect({ inquiryId: string, current: InquiryStatus })` (client component).

- [ ] **Step 1: Write the status-update route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  status: z.enum(["new", "contacted", "closed"]),
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
    .from("seller_inquiries")
    .update({ status: parsed.data.status })
    .eq("id", ctx.params.id)
    .select("id, status")
    .single();

  if (error) {
    console.error("admin/inquiries status update failed:", error);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, inquiry: data });
}
```

- [ ] **Step 2: Write the status-select client component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InquiryStatus } from "@/lib/supabase/types";

const STATUSES: InquiryStatus[] = ["new", "contacted", "closed"];

export function InquiryStatusSelect({ inquiryId, current }: { inquiryId: string; current: InquiryStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<InquiryStatus>(current);
  const [loading, setLoading] = useState(false);

  async function change(next: InquiryStatus) {
    setLoading(true);
    const res = await fetch(`/api/admin/inquiries/${inquiryId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  return (
    <select
      disabled={loading}
      value={status}
      onChange={(e) => change(e.target.value as InquiryStatus)}
      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Write the staff page**

```tsx
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InquiryStatusSelect } from "@/components/admin/inquiry-status-select";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import { formatDate } from "@/lib/utils";
import type { SellerInquiry } from "@/lib/supabase/types";

export default async function AdminInquiriesPage() {
  await requireRole(["admin"]);
  const supabase = createClient();
  const { data: inquiries } = await supabase
    .from("seller_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Service requests</CardTitle>
          <CardDescription>Rider requests routed from the seller directory — work the queue here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries?.length ? (
                (inquiries as SellerInquiry[]).map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell>
                      {isSellerServiceType(inquiry.service_type)
                        ? SELLER_SERVICE_META[inquiry.service_type].label
                        : inquiry.service_type}
                    </TableCell>
                    <TableCell className="max-w-md truncate">{inquiry.message}</TableCell>
                    <TableCell>{formatDate(inquiry.created_at)}</TableCell>
                    <TableCell>
                      <InquiryStatusSelect inquiryId={inquiry.id} current={inquiry.status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                    No requests yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint app/api/admin/inquiries components/admin/inquiry-status-select.tsx "app/(authed)/admin/inquiries/page.tsx"`
Expected: no errors.

- [ ] **Step 5: Verify live**

```sql
select id, service_type, status from public.seller_inquiries
where rider_user_id = 'e5e7dae2-dc77-4994-9bd1-9c5543e1ba14';
```
Expected: the Task 1 fixture row, `status = 'new'` — confirms the admin page's unfiltered query shape returns real data to render.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/inquiries components/admin/inquiry-status-select.tsx "app/(authed)/admin/inquiries/page.tsx"
git commit -m "Add staff inquiries queue (list + status update)"
```

---

## Phase 3 completion check

- [ ] `npx tsc --noEmit -p .` — clean
- [ ] `npx eslint app components lib` — clean
- [ ] `npm run build` — clean, confirm `/services/[sellerId]/request`, `/api/seller-inquiries`, `/admin/inquiries`, `/api/admin/inquiries/[id]/status` all appear in the route list
- [ ] Re-read the spec's Phase 3 section and confirm every bullet has a task above: `seller_inquiries` table + RLS with seller having zero read access ✓ Task 1, `POST /api/seller-inquiries` rider-only ✓ Task 3, `/admin/inquiries` staff page with status update ✓ Task 5, "Request this service" button wired ✓ Task 4.

Once this passes, Phase 4 (reviews) gets its own plan the same way — do not start writing Phase 4 code inside this plan's tasks.
