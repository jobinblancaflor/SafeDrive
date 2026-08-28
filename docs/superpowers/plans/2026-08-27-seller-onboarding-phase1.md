# Seller Onboarding Phase 1 (Expansion + Hard Gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand seller onboarding from 2 steps to 5 (business, services, area, documents, agreement) and hard-block dashboard access for a seller who hasn't finished it.

**Architecture:** Extend the existing wizard/step-component pattern in `components/onboarding/` with two new leaf step components and one modified step component, orchestrated by a rewritten `seller-onboarding-wizard.tsx`. Each step persists its own slice of `seller_profiles` (or a new `seller_documents` table) via a direct Supabase client upsert on "Continue," matching the existing business/area steps' pattern — so a seller who closes the tab mid-flow resumes where they left off. The hard gate is a new check inside the existing `middleware.ts`, reusing its established admin/authority-gate shape.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Storage + `@supabase/ssr`), Zod, Tailwind, `lucide-react` icons. No test framework is installed in this repo (no jest/vitest/playwright — confirmed via `package.json`) — every task's "test" step is `npx tsc --noEmit -p .` + `npx eslint <files>` (this repo's established verification bar all session) plus, where the change is server-reachable, a direct API/SQL check via the Supabase MCP tools. This deliberately does not introduce a new test framework — out of scope for this feature.

**Spec:** `docs/superpowers/specs/2026-08-27-seller-marketplace-design.md` (Phase 1 section)

## Global Constraints

- Migrations are applied live via the Supabase MCP `apply_migration` tool against project `rsbheplvzouajrjhusfl` as part of Task 1 — never left as an unapplied `.sql` file for the user to run manually.
- New tables use owner-CRUD + staff-read-all RLS (`is_staff(auth.uid())`), matching `emergency_contacts` — this is a session-authenticated feature end to end; nothing here is device-facing, so no `X-Device-Key` and no service-role client except where `profiles.role` itself is being written (matches the existing `complete` route's documented reasoning).
- Service catalog is closed: `towing`, `battery`, `tire`, `lockout` — defined once in `lib/seller-service-type.ts`, imported everywhere else that needs it (never re-typed as a literal string union in a second file).
- The hard gate is enforced in `middleware.ts`, which — per its own `matcher` config — never runs for `/api/*` routes. This gate protects **page navigation only**, matching the existing admin/authority gate's scope exactly; it is not a claim that every API route independently checks onboarding status.
- `npm run dev` session has no active login credentials available in this environment — steps that would otherwise be "click through the UI" are instead verified via `npx tsc --noEmit`, `npx eslint`, `npm run build`, and direct Supabase MCP `execute_sql`/`apply_migration` checks (the pattern used successfully for every prior feature this session).

---

### Task 1: Database schema (migration + storage bucket)

**Files:**
- Create: `supabase/migrations/0016_seller_marketplace_phase1.sql`

**Interfaces:**
- Produces: `public.seller_profiles.agreement_accepted_at` (timestamptz, nullable), `public.seller_profiles.agreement_version` (text, nullable), `public.seller_documents` table (`id uuid pk`, `seller_user_id uuid`, `document_type text` — `'business_permit' | 'government_id'`, `storage_path text`, `uploaded_at timestamptz`), Storage bucket `seller_documents` (private).

- [ ] **Step 1: Write the migration file**

```sql
-- 0016_seller_marketplace_phase1.sql
-- Phase 1 of the seller marketplace: onboarding gains services (already
-- has a text[] column, reused as-is with values constrained by the app's
-- Zod schema rather than a DB check — matches this table's existing
-- convention), required business documents, and service-agreement
-- acceptance.

alter table public.seller_profiles
  add column if not exists agreement_accepted_at timestamptz,
  add column if not exists agreement_version text;

create table if not exists public.seller_documents (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check (document_type in ('business_permit', 'government_id')),
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

create unique index if not exists seller_documents_one_per_type
  on public.seller_documents (seller_user_id, document_type);

alter table public.seller_documents enable row level security;

create policy "seller_document owner all" on public.seller_documents
  for all using (seller_user_id = auth.uid()) with check (seller_user_id = auth.uid());
create policy "seller_document staff read" on public.seller_documents
  for select using (public.is_staff(auth.uid()));

-- Private bucket for seller-submitted documents (business permit/license,
-- government id). Never public — unlike profile_images, these are only
-- ever fetched via signed URLs for staff review.
insert into storage.buckets (id, name, public)
values ('seller_documents', 'seller_documents', false)
on conflict (id) do nothing;

-- Storage objects are keyed by path "<seller_user_id>/<document_type>.<ext>";
-- storage.foldername(name) splits that path into an array, so element 1
-- is the owning user's id — the standard Supabase per-user-folder RLS idiom.
create policy "seller_document object owner all" on storage.objects
  for all
  using (bucket_id = 'seller_documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'seller_documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "seller_document object staff read" on storage.objects
  for select
  using (bucket_id = 'seller_documents' and public.is_staff(auth.uid()));
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call the `apply_migration` MCP tool with `project_id: "rsbheplvzouajrjhusfl"`, `name: "seller_marketplace_phase1"`, and `query` set to the exact SQL from Step 1.

Expected: `{"success":true}`.

- [ ] **Step 3: Verify the schema live**

Call `execute_sql` with `project_id: "rsbheplvzouajrjhusfl"` and:
```sql
select column_name, data_type from information_schema.columns
where table_name = 'seller_profiles' and column_name in ('agreement_accepted_at', 'agreement_version');

select column_name, data_type from information_schema.columns
where table_name = 'seller_documents' order by ordinal_position;

select id, public from storage.buckets where id = 'seller_documents';

select policyname, cmd from pg_policies where tablename = 'seller_documents';
select policyname, cmd from pg_policies where tablename = 'objects' and schemaname = 'storage' and policyname like 'seller_document%';
```
Expected: both new `seller_profiles` columns present; `seller_documents` has all 5 columns; the bucket row exists with `public = false`; 2 policies on `seller_documents` (`owner all`, `staff read`); 2 policies on `storage.objects` (`owner all`, `staff read`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0016_seller_marketplace_phase1.sql
git commit -m "Add seller_documents table, agreement columns, and seller_documents storage bucket"
```

---

### Task 2: Shared service-catalog constant

**Files:**
- Create: `lib/seller-service-type.ts`

**Interfaces:**
- Produces: `type SellerServiceType = "towing" | "battery" | "tire" | "lockout"`, `type SellerServiceMeta = { type: SellerServiceType; label: string; description: string }`, `const SELLER_SERVICE_META: Record<SellerServiceType, SellerServiceMeta>`, `const SELLER_SERVICE_OPTIONS: SellerServiceType[]`, `function isSellerServiceType(value: unknown): value is SellerServiceType`.

- [ ] **Step 1: Write the file**

```ts
// lib/seller-service-type.ts
// Single source of truth for the closed roadside-assistance service
// catalog. Mirrors the pattern in lib/incident-type.ts.

export type SellerServiceType = "towing" | "battery" | "tire" | "lockout";

export type SellerServiceMeta = {
  type: SellerServiceType;
  label: string;
  description: string;
};

export const SELLER_SERVICE_META: Record<SellerServiceType, SellerServiceMeta> = {
  towing: {
    type: "towing",
    label: "Towing",
    description: "Tow a vehicle to a repair shop or safe location",
  },
  battery: {
    type: "battery",
    label: "Battery",
    description: "Jump-start or replace a dead battery",
  },
  tire: {
    type: "tire",
    label: "Tire",
    description: "Repair or replace a flat tire",
  },
  lockout: {
    type: "lockout",
    label: "Lockout",
    description: "Help a driver locked out of their own vehicle",
  },
};

export const SELLER_SERVICE_OPTIONS: SellerServiceType[] = ["towing", "battery", "tire", "lockout"];

export function isSellerServiceType(value: unknown): value is SellerServiceType {
  return typeof value === "string" && (SELLER_SERVICE_OPTIONS as string[]).includes(value);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/seller-service-type.ts
git commit -m "Add closed seller service-type catalog"
```

---

### Task 3: Extend shared Supabase types

**Files:**
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Consumes: `SellerServiceType` from `lib/seller-service-type.ts` (Task 2).
- Produces: `SellerProfile` gains `agreement_accepted_at: string | null` and `agreement_version: string | null`; new `type SellerDocument = { id: string; seller_user_id: string; document_type: "business_permit" | "government_id"; storage_path: string; uploaded_at: string }`.

- [ ] **Step 1: Edit the `SellerProfile` type**

Find the existing `SellerProfile` type (it currently ends with `onboarding_completed_at`, `created_at`, `updated_at`) and add the two new fields:

```ts
export type SellerProfile = {
  id: string;
  user_id: string;
  business_name: string | null;
  services: string[];
  business_hours: BusinessHours;
  contact_phone: string | null;
  contact_email: string | null;
  area_label: string | null;
  area_lat: number | null;
  area_lng: number | null;
  area_radius_meters: number | null;
  agreement_accepted_at: string | null;
  agreement_version: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SellerDocument = {
  id: string;
  seller_user_id: string;
  document_type: "business_permit" | "government_id";
  storage_path: string;
  uploaded_at: string;
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors (this will surface any other file that constructs a `SellerProfile` literal missing the two new optional-looking-but-required fields — there are none yet, since Task 1's columns are brand new and nothing reads them yet).

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "Add agreement fields to SellerProfile, add SellerDocument type"
```

---

### Task 4: Remove the free-text services field from the business step

The existing "Services offered" tag-input in `seller-step-business.tsx` free-types arbitrary strings — that's being replaced by a closed-catalog picker in its own step (Task 5). This task removes it from Step 1 so there's exactly one place services are chosen.

**Files:**
- Modify: `components/onboarding/seller-step-business.tsx`

**Interfaces:**
- Produces: `BusinessDetails` type drops `services: string[]` — becomes `{ businessName: string; businessHours: BusinessHours; contactPhone: string; contactEmail: string }`. `SellerStepBusiness`'s `canContinue` no longer checks `services.length`.

- [ ] **Step 1: Remove the services field and its state/handlers**

In `components/onboarding/seller-step-business.tsx`:
- Remove `import { X } from "lucide-react";` (only used by the services chips).
- Remove `import { useState } from "react";` and the `serviceDraft` state + `addService`/`removeService` functions (nothing else in the file uses `useState`).
- Remove `services: string[];` from the `BusinessDetails` type.
- Remove the entire "Services offered" `<div className="space-y-1">...</div>` block (the `biz-services` input, Add button, and chip list).
- Change `const canContinue = value.businessName.trim().length > 0 && value.services.length > 0;` to `const canContinue = value.businessName.trim().length > 0;`.

The resulting file:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import type { BusinessHours } from "@/lib/supabase/types";

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export type BusinessDetails = {
  businessName: string;
  businessHours: BusinessHours;
  contactPhone: string;
  contactEmail: string;
};

export function SellerStepBusiness({
  value,
  onChange,
  onNext,
  submitting,
}: {
  value: BusinessDetails;
  onChange: (next: BusinessDetails) => void;
  onNext: () => void;
  submitting?: boolean;
}) {
  function setDay(day: keyof BusinessHours, patch: Partial<{ open: string; close: string; closed: boolean }>) {
    const current = value.businessHours[day] ?? { open: "09:00", close: "17:00" };
    onChange({
      ...value,
      businessHours: { ...value.businessHours, [day]: { ...current, ...patch } },
    });
  }

  const canContinue = value.businessName.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="biz-name">Business name</Label>
        <Input
          id="biz-name"
          required
          value={value.businessName}
          onChange={(e) => onChange({ ...value, businessName: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Business hours</Label>
        <div className="space-y-2 rounded-lg border p-3">
          {DAYS.map(({ key, label }) => {
            const day = value.businessHours[key];
            const closed = day?.closed ?? false;
            return (
              <div key={key} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-600">{label}</span>
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) => setDay(key, { closed: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Closed
                </label>
                {!closed && (
                  <>
                    <input
                      type="time"
                      value={day?.open ?? "09:00"}
                      onChange={(e) => setDay(key, { open: e.target.value })}
                      className="h-8 rounded-md border border-slate-200 px-2 text-sm"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="time"
                      value={day?.close ?? "17:00"}
                      onChange={(e) => setDay(key, { close: e.target.value })}
                      className="h-8 rounded-md border border-slate-200 px-2 text-sm"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="biz-phone">Contact phone</Label>
          <PhoneInput
            id="biz-phone"
            value={value.contactPhone}
            onChange={(v) => onChange({ ...value, contactPhone: v })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="biz-email">Contact email</Label>
          <Input
            id="biz-email"
            type="email"
            value={value.contactEmail}
            onChange={(e) => onChange({ ...value, contactEmail: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={!canContinue || submitting} onClick={onNext}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (expect a break — that's Task 9's job to fix)**

Run: `npx tsc --noEmit -p .`
Expected: errors in `seller-onboarding-wizard.tsx` (it still references `business.services` and constructs `BusinessDetails` with a `services` field). This is expected — Task 9 rewrites that file. Do not fix it here; just confirm the *only* errors are in `seller-onboarding-wizard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/seller-step-business.tsx
git commit -m "Remove free-text services field from business step (moving to closed-catalog step)"
```

---

### Task 5: New services step (closed catalog)

**Files:**
- Create: `components/onboarding/seller-step-services.tsx`

**Interfaces:**
- Consumes: `SellerServiceType`, `SELLER_SERVICE_OPTIONS`, `SELLER_SERVICE_META` from `lib/seller-service-type.ts` (Task 2).
- Produces: `SellerStepServices({ value: SellerServiceType[], onChange: (next: SellerServiceType[]) => void, onBack: () => void, onNext: () => void, submitting?: boolean })`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SELLER_SERVICE_META, SELLER_SERVICE_OPTIONS, type SellerServiceType } from "@/lib/seller-service-type";

export function SellerStepServices({
  value,
  onChange,
  onBack,
  onNext,
  submitting,
}: {
  value: SellerServiceType[];
  onChange: (next: SellerServiceType[]) => void;
  onBack: () => void;
  onNext: () => void;
  submitting?: boolean;
}) {
  function toggle(type: SellerServiceType) {
    if (value.includes(type)) {
      onChange(value.filter((v) => v !== type));
    } else {
      onChange([...value, type]);
    }
  }

  const canContinue = value.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>Services offered</Label>
        <p className="text-sm text-slate-500">Pick every service you can respond to. At least one is required.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SELLER_SERVICE_OPTIONS.map((type) => {
          const meta = SELLER_SERVICE_META[type];
          const checked = value.includes(type);
          return (
            <label
              key={type}
              className={
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
                (checked ? "border-secondary bg-secondary/5" : "border-slate-200 hover:bg-slate-50")
              }
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(type)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{meta.label}</span>
                <span className="block text-xs text-slate-500">{meta.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" disabled={!canContinue || submitting} onClick={onNext}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/onboarding/seller-step-services.tsx`
Expected: the same pre-existing `seller-onboarding-wizard.tsx` errors from Task 4 (not yet fixed), no *new* errors from this file; eslint clean on this file.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/seller-step-services.tsx
git commit -m "Add seller onboarding services step (closed catalog)"
```

---

### Task 6: Rename Area step's finish props to next props

Area moves from being the last step to the middle step — it now advances to Documents instead of submitting the whole wizard.

**Files:**
- Modify: `components/onboarding/seller-step-area.tsx`

**Interfaces:**
- Produces: `SellerStepArea({ value: AreaDetails, onChange, onBack, onNext: () => void, submitting?: boolean })` — drops `onFinish`, `finishing`, `finishError` (renamed to `onNext`, `submitting`, and the error display is removed since the wizard now shows step-level errors itself, matching how Business/Services already do it).

- [ ] **Step 1: Rename the props and drop the inline error display**

In `components/onboarding/seller-step-area.tsx`, change the function signature:

```tsx
export function SellerStepArea({
  value,
  onChange,
  onBack,
  onNext,
  submitting,
}: {
  value: AreaDetails;
  onChange: (next: AreaDetails) => void;
  onBack: () => void;
  onNext: () => void;
  submitting?: boolean;
}) {
```

Replace every `finishing` reference with `submitting`, and replace the final block:

```tsx
      {finishError && <p className="text-sm text-status-critical">{finishError}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={finishing}>
          Back
        </Button>
        <Button type="button" onClick={onFinish} disabled={finishing}>
          {finishing ? "Finishing…" : "Finish"}
        </Button>
      </div>
```

with:

```tsx
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={submitting}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: same pre-existing `seller-onboarding-wizard.tsx` errors as before, plus new ones there for the now-mismatched `SellerStepArea` props (still Task 9's job) — no errors in `seller-step-area.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/seller-step-area.tsx
git commit -m "Rename SellerStepArea finish props to next props (no longer the last step)"
```

---

### Task 7: New documents step

Each file uploads immediately on selection (mirrors the existing avatar-upload pattern in `components/auth/profile-form.tsx`), so "Continue" just needs both documents present — nothing to batch-save.

**Files:**
- Create: `components/onboarding/seller-step-documents.tsx`

**Interfaces:**
- Consumes: `SellerDocument` from `lib/supabase/types.ts` (Task 3), `createClient` from `lib/supabase/client.ts` (existing).
- Produces: `SellerStepDocuments({ userId: string, initialDocuments: SellerDocument[], onBack: () => void, onNext: () => void })`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { SellerDocument } from "@/lib/supabase/types";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type DocumentType = "business_permit" | "government_id";

const DOCUMENT_LABELS: Record<DocumentType, { label: string; description: string }> = {
  business_permit: {
    label: "Business permit or license",
    description: "A photo or scan of your business registration/permit",
  },
  government_id: {
    label: "Government-issued ID",
    description: "A valid ID for the person running this business",
  },
};

export function SellerStepDocuments({
  userId,
  initialDocuments,
  onBack,
  onNext,
}: {
  userId: string;
  initialDocuments: SellerDocument[];
  onBack: () => void;
  onNext: () => void;
}) {
  const [uploaded, setUploaded] = useState<Record<DocumentType, boolean>>({
    business_permit: initialDocuments.some((d) => d.document_type === "business_permit"),
    government_id: initialDocuments.some((d) => d.document_type === "government_id"),
  });
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPickFile(documentType: DocumentType, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Use a JPEG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File must be under 10MB.");
      return;
    }

    setUploading(documentType);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "bin";
    const path = `${userId}/${documentType}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("seller_documents")
      .upload(path, file, { upsert: true });
    if (uploadErr) {
      setUploading(null);
      setError(uploadErr.message);
      return;
    }

    const { error: rowErr } = await supabase.from("seller_documents").upsert(
      {
        seller_user_id: userId,
        document_type: documentType,
        storage_path: path,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "seller_user_id,document_type" },
    );
    setUploading(null);
    if (rowErr) {
      setError(rowErr.message);
      return;
    }
    setUploaded((prev) => ({ ...prev, [documentType]: true }));
  }

  const canContinue = uploaded.business_permit && uploaded.government_id;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>Business documents</Label>
        <p className="text-sm text-slate-500">Both documents are required before you can start receiving requests.</p>
      </div>

      <div className="space-y-3">
        {(Object.keys(DOCUMENT_LABELS) as DocumentType[]).map((type) => {
          const meta = DOCUMENT_LABELS[type];
          const isUploaded = uploaded[type];
          const isUploading = uploading === type;
          return (
            <div key={type} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{meta.label}</p>
                  <p className="text-xs text-slate-500">{meta.description}</p>
                </div>
              </div>
              <div className="shrink-0">
                {isUploaded ? (
                  <span className="flex items-center gap-1.5 text-sm text-status-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Uploaded
                  </span>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    {isUploading ? "Uploading…" : "Upload"}
                    <input
                      type="file"
                      accept={ALLOWED_TYPES.join(",")}
                      className="hidden"
                      disabled={isUploading}
                      onChange={(e) => onPickFile(type, e)}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-status-critical">{error}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" disabled={!canContinue} onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/onboarding/seller-step-documents.tsx`
Expected: no new errors from this file (pre-existing `seller-onboarding-wizard.tsx` errors from earlier tasks persist until Task 9); eslint clean.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/seller-step-documents.tsx
git commit -m "Add seller onboarding documents step"
```

---

### Task 8: New agreement step

Becomes the wizard's final step — owns the "Finish" action, error display, and submitting state (moved from Area in Task 6).

**Files:**
- Create: `components/onboarding/seller-step-agreement.tsx`

**Interfaces:**
- Produces: `export const SERVICE_AGREEMENT_VERSION = "2026-08-v1"`, `SellerStepAgreement({ accepted: boolean, onChange: (v: boolean) => void, onBack: () => void, onFinish: () => void, finishing: boolean, finishError: string | null })`.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { Button } from "@/components/ui/button";

export const SERVICE_AGREEMENT_VERSION = "2026-08-v1";

export function SellerStepAgreement({
  accepted,
  onChange,
  onBack,
  onFinish,
  finishing,
  finishError,
}: {
  accepted: boolean;
  onChange: (v: boolean) => void;
  onBack: () => void;
  onFinish: () => void;
  finishing: boolean;
  finishError: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">Service agreement</h3>
        <p className="text-sm text-slate-500">Review and accept before you can start receiving requests.</p>
      </div>

      <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
        <p>
          By accepting this agreement, you confirm that the business details, services, service area, and
          documents you&apos;ve provided are accurate, and that you are authorized to offer the roadside
          assistance services you&apos;ve selected.
        </p>
        <p>
          Secure Signal lists your business to riders and routes service requests to us on your behalf — we do
          not connect riders to you directly inside the app. You are solely responsible for the services you
          perform, their quality and safety, and compliance with any applicable local licensing or insurance
          requirements. Secure Signal is not a party to, and assumes no liability for, any service you provide.
        </p>
        <p>
          You agree to respond to service requests routed to you in a timely manner and to keep your listed
          business hours, service area, and contact information current. Secure Signal may remove your listing
          at its discretion, including for inaccurate information, unresponsiveness, or complaints from riders.
        </p>
        <p>This is version {SERVICE_AGREEMENT_VERSION} of the agreement.</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        I have read and agree to the Service Agreement (version {SERVICE_AGREEMENT_VERSION}).
      </label>

      {finishError && <p className="text-sm text-status-critical">{finishError}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={finishing}>
          Back
        </Button>
        <Button type="button" onClick={onFinish} disabled={!accepted || finishing}>
          {finishing ? "Finishing…" : "Finish"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint components/onboarding/seller-step-agreement.tsx`
Expected: no new errors from this file; eslint clean.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/seller-step-agreement.tsx
git commit -m "Add seller onboarding service-agreement step"
```

---

### Task 9: Rewrite the wizard for 5 steps

This is where Tasks 4–8's dangling type errors get resolved.

**Files:**
- Modify: `components/onboarding/seller-onboarding-wizard.tsx`

**Interfaces:**
- Consumes: `SellerStepBusiness`/`BusinessDetails` (Task 4), `SellerStepServices` (Task 5), `SellerStepArea`/`AreaDetails` (Task 6), `SellerStepDocuments` (Task 7), `SellerStepAgreement`/`SERVICE_AGREEMENT_VERSION` (Task 8), `SellerServiceType` (Task 2), `SellerProfile`/`SellerDocument` (Task 3).
- Produces: `SellerOnboardingWizard({ userId: string, initial: SellerProfile | null, initialDocuments: SellerDocument[] })` — the `initialDocuments` prop is new, supplied by Task 10.

- [ ] **Step 1: Write the full replacement file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SellerStepBusiness, type BusinessDetails } from "@/components/onboarding/seller-step-business";
import { SellerStepServices } from "@/components/onboarding/seller-step-services";
import { SellerStepArea, type AreaDetails } from "@/components/onboarding/seller-step-area";
import { SellerStepDocuments } from "@/components/onboarding/seller-step-documents";
import { SellerStepAgreement, SERVICE_AGREEMENT_VERSION } from "@/components/onboarding/seller-step-agreement";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import type { SellerServiceType } from "@/lib/seller-service-type";
import type { SellerProfile, SellerDocument } from "@/lib/supabase/types";

const STEP_LABELS = ["Business details", "Services", "Areas supported", "Documents", "Agreement"] as const;
type Step = 1 | 2 | 3 | 4 | 5;

export function SellerOnboardingWizard({
  userId,
  initial,
  initialDocuments,
}: {
  userId: string;
  initial: SellerProfile | null;
  initialDocuments: SellerDocument[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [business, setBusiness] = useState<BusinessDetails>({
    businessName: initial?.business_name ?? "",
    businessHours: initial?.business_hours ?? {},
    contactPhone: initial?.contact_phone ?? "",
    contactEmail: initial?.contact_email ?? "",
  });
  const [services, setServices] = useState<SellerServiceType[]>(
    (initial?.services ?? []).filter((s): s is SellerServiceType =>
      ["towing", "battery", "tire", "lockout"].includes(s),
    ),
  );
  const [area, setArea] = useState<AreaDetails>({
    center:
      initial?.area_lat != null && initial?.area_lng != null
        ? { lat: initial.area_lat, lng: initial.area_lng }
        : DEFAULT_CENTER,
    label: initial?.area_label ?? null,
    radiusKm: initial?.area_radius_meters ? Math.round(initial.area_radius_meters / 1000) : 10,
  });
  const [agreementAccepted, setAgreementAccepted] = useState(initial?.agreement_accepted_at != null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveBusiness() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      {
        user_id: userId,
        business_name: business.businessName,
        business_hours: business.businessHours,
        contact_phone: business.contactPhone || null,
        contact_email: business.contactEmail || null,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setStep(2);
  }

  async function saveServices() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      { user_id: userId, services },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setStep(3);
  }

  async function saveArea() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      {
        user_id: userId,
        area_label: area.label,
        area_lat: area.center.lat,
        area_lng: area.center.lng,
        area_radius_meters: area.radiusKm * 1000,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setStep(4);
  }

  async function finish() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      {
        user_id: userId,
        agreement_accepted_at: new Date().toISOString(),
        agreement_version: SERVICE_AGREEMENT_VERSION,
      },
      { onConflict: "user_id" },
    );
    if (upsertError) {
      setSaving(false);
      setError(upsertError.message);
      return;
    }

    const res = await fetch("/api/seller/onboarding/complete", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Could not finish onboarding.");
      return;
    }
    router.push("/profile");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-sm">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-4 bg-slate-200" />}
              <StepBadge n={n} active={step === n} done={step > n} label={label} />
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-white p-6">
        {step === 1 && (
          <SellerStepBusiness value={business} onChange={setBusiness} onNext={saveBusiness} submitting={saving} />
        )}
        {step === 2 && (
          <SellerStepServices
            value={services}
            onChange={setServices}
            onBack={() => setStep(1)}
            onNext={saveServices}
            submitting={saving}
          />
        )}
        {step === 3 && (
          <SellerStepArea
            value={area}
            onChange={setArea}
            onBack={() => setStep(2)}
            onNext={saveArea}
            submitting={saving}
          />
        )}
        {step === 4 && (
          <SellerStepDocuments
            userId={userId}
            initialDocuments={initialDocuments}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <SellerStepAgreement
            accepted={agreementAccepted}
            onChange={setAgreementAccepted}
            onBack={() => setStep(4)}
            onFinish={finish}
            finishing={saving}
            finishError={error}
          />
        )}
        {step !== 5 && error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      </div>
    </div>
  );
}

function StepBadge({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium " +
          (active
            ? "bg-secondary text-white"
            : done
              ? "bg-status-success/20 text-status-success"
              : "bg-slate-100 text-slate-500")
        }
      >
        {n}
      </span>
      <span className={active ? "font-medium text-slate-900" : "text-slate-500"}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors anywhere (this resolves every dangling error from Tasks 4–8) — except Task 10 hasn't updated the page that calls this component yet, so expect exactly one error in `app/(authed)/onboarding/seller/page.tsx` ("Property 'initialDocuments' is missing").

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/seller-onboarding-wizard.tsx
git commit -m "Rewrite seller onboarding wizard for 5 steps"
```

---

### Task 10: Fetch documents in the onboarding page

**Files:**
- Modify: `app/(authed)/onboarding/seller/page.tsx`

**Interfaces:**
- Consumes: `SellerDocument` from `lib/supabase/types.ts` (Task 3), `SellerOnboardingWizard`'s new `initialDocuments` prop (Task 9).

- [ ] **Step 1: Fetch `seller_documents` and pass it down**

Replace the file with:

```tsx
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { SellerOnboardingWizard } from "@/components/onboarding/seller-onboarding-wizard";
import type { SellerProfile, SellerDocument } from "@/lib/supabase/types";

export default async function SellerOnboardingPage() {
  const profile = await requireProfile();
  if (profile.role !== "rider" && profile.role !== "seller") {
    redirect("/");
  }

  const supabase = createClient();
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("user_id", profile.id)
    .maybeSingle();

  const { data: documents } = await supabase
    .from("seller_documents")
    .select("*")
    .eq("seller_user_id", profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {sellerProfile?.onboarding_completed_at ? "Business profile" : "Become a seller"}
        </h1>
        <p className="text-sm text-slate-500">
          Tell us about your business and where you operate.
        </p>
      </div>
      <SellerOnboardingWizard
        userId={profile.id}
        initial={sellerProfile as SellerProfile | null}
        initialDocuments={(documents ?? []) as SellerDocument[]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Commit**

```bash
git add "app/(authed)/onboarding/seller/page.tsx"
git commit -m "Fetch seller documents for the onboarding wizard"
```

---

### Task 11: Validate the new fields before promoting to seller

**Files:**
- Modify: `app/api/seller/onboarding/complete/route.ts`

**Interfaces:**
- Produces: same route contract (`POST` → `{ ok: true }` | `{ error: string }`), now also checking `seller_documents` and `agreement_accepted_at`.

- [ ] **Step 1: Add the document and agreement checks**

Replace the body of `POST` with:

```ts
export async function POST() {
  const profile = await requireProfile();
  if (profile.role !== "rider" && profile.role !== "seller") {
    return NextResponse.json(
      { error: "This role can't start seller onboarding." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: sellerProfile, error: fetchError } = await admin
    .from("seller_profiles")
    .select("business_name, services, area_lat, area_lng, area_radius_meters, agreement_accepted_at")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (fetchError) {
    console.error("seller onboarding complete: fetch failed", fetchError);
    return NextResponse.json({ error: "Could not load your business profile." }, { status: 500 });
  }
  if (
    !sellerProfile?.business_name ||
    !sellerProfile.services?.length ||
    sellerProfile.area_lat == null ||
    sellerProfile.area_lng == null ||
    sellerProfile.area_radius_meters == null ||
    !sellerProfile.agreement_accepted_at
  ) {
    return NextResponse.json(
      { error: "Finish every onboarding step before submitting." },
      { status: 400 },
    );
  }

  const { data: documents, error: documentsError } = await admin
    .from("seller_documents")
    .select("document_type")
    .eq("seller_user_id", profile.id);
  if (documentsError) {
    console.error("seller onboarding complete: documents fetch failed", documentsError);
    return NextResponse.json({ error: "Could not load your documents." }, { status: 500 });
  }
  const documentTypes = new Set((documents ?? []).map((d) => d.document_type));
  if (!documentTypes.has("business_permit") || !documentTypes.has("government_id")) {
    return NextResponse.json(
      { error: "Upload both required documents before submitting." },
      { status: 400 },
    );
  }

  const { error: completeError } = await admin
    .from("seller_profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("user_id", profile.id);
  if (completeError) {
    console.error("seller onboarding complete: stamp failed", completeError);
    return NextResponse.json({ error: "Could not finish onboarding." }, { status: 500 });
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "seller" })
    .eq("id", profile.id);
  if (roleError) {
    console.error("seller onboarding complete: role update failed", roleError);
    return NextResponse.json({ error: "Could not finish onboarding." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

The file's imports (`NextResponse`, `requireProfile`, `createAdminClient`) and its doc comment above `POST` are unchanged.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint app/api/seller/onboarding/complete/route.ts`
Expected: no errors.

- [ ] **Step 3: Verify live against real data**

Using the Supabase MCP `execute_sql` tool against project `rsbheplvzouajrjhusfl`, find or create a test profile with `role = 'rider'`, then:
```sql
-- confirm no seller_profiles row yet for that user (skip if one already exists from prior testing)
select * from public.seller_profiles where user_id = '<test-user-id>';
```
Then, with the dev server running (`preview_start` with the `dev` config) and a way to call the route as that user is not available without a live session in this environment, instead verify the **validation logic itself** by directly querying what the route would compute:
```sql
select business_name, services, area_lat, area_lng, area_radius_meters, agreement_accepted_at
from public.seller_profiles where user_id = '<test-user-id>';

select document_type from public.seller_documents where seller_user_id = '<test-user-id>';
```
Confirm by inspection that the route's condition (`!business_name || !services.length || area_lat == null || area_lng == null || area_radius_meters == null || !agreement_accepted_at`) and the `documentTypes.has(...)` checks correctly reject a row missing any of these fields, using whatever real/test data exists. If no seller test data exists at all, this step can be satisfied by re-confirming the earlier session's already-proven pattern (this route was live-tested before adding these checks; the new checks are structurally identical `!field` guards, same pattern, same file) — note in the task's completion log which of the two verification levels was actually performed.

- [ ] **Step 4: Commit**

```bash
git add app/api/seller/onboarding/complete/route.ts
git commit -m "Require documents and agreement acceptance before promoting to seller"
```

---

### Task 12: Hard-gate incomplete sellers in middleware

**Files:**
- Modify: `middleware.ts`

**Interfaces:**
- Produces: same middleware contract; adds a redirect-to-`/onboarding/seller` branch for `role === "seller"` with no `onboarding_completed_at`.

- [ ] **Step 1: Add the seller gate**

Replace the body of the `middleware` function from the `const { pathname }...` line onward with:

```ts
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
  const isAdmin = pathname.startsWith(ADMIN_PREFIX);
  const isAuthority = pathname.startsWith(AUTHORITY_PREFIX);
  const isSellerOnboarding = pathname === "/onboarding/seller" || pathname.startsWith("/onboarding/seller/");

  // Unauthed users hitting protected routes → /login
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Fetch role once for any authenticated request on a protected route —
  // reused by both the admin/authority gate below and the seller gate.
  let role: string | undefined;
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = profile?.role as string | undefined;
  }

  // Role gates
  if (user && (isAdmin || isAuthority)) {
    if (isAdmin && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    if (isAuthority && role !== "admin" && role !== "authority") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  // Seller onboarding gate — a seller who hasn't finished onboarding can
  // only reach /onboarding/seller until they do. Page-level only: this
  // middleware's own matcher (below) never runs for /api/*.
  if (user && !isPublic && role === "seller" && !isSellerOnboarding) {
    const { data: sellerProfile } = await supabase
      .from("seller_profiles")
      .select("onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sellerProfile?.onboarding_completed_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/seller";
      return NextResponse.redirect(url);
    }
  }

  // Authed users on auth pages → /
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
```

(Everything above `const { pathname } = ...` — the `NextResponse.next(...)` setup and `createServerClient` block — is unchanged. The `export const config = { matcher: [...] }` block at the end of the file is also unchanged.)

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p .` then `npx eslint middleware.ts`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: clean build, no new warnings.

- [ ] **Step 4: Verify live**

With the dev server running:
1. Confirm the schema check from Task 1 still holds (`seller_profiles.onboarding_completed_at` reachable).
2. Using `execute_sql`, find a real `profiles` row with `role = 'seller'` and check whether it has a `seller_profiles.onboarding_completed_at`. Note which case exists (complete / incomplete / no `seller_profiles` row at all) — the middleware must treat "no row" the same as "incomplete" (the `!sellerProfile?.onboarding_completed_at` check already does this via optional chaining, since `maybeSingle()` returns `null` for no row).
3. If there's no way to authenticate as that seller in this environment (matches this session's known constraint — no login credentials available), this step is satisfied by the typecheck/lint/build pass plus the by-inspection confirmation in point 2 that the query and null-handling are correct; note this limitation rather than claiming a live click-through was performed.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "Hard-gate incomplete sellers to the onboarding wizard"
```

---

## Phase 1 completion check

After Task 12, re-run the full verification bar once more end to end:

- [ ] `npx tsc --noEmit -p .` — clean
- [ ] `npx eslint app components lib middleware.ts` — clean
- [ ] `npm run build` — clean
- [ ] Re-read `docs/superpowers/specs/2026-08-27-seller-marketplace-design.md`'s Phase 1 section and confirm every bullet has a corresponding task above (services catalog ✓ Task 5, documents ✓ Task 7, agreement ✓ Task 8, hard gate ✓ Task 12, `agreement_accepted_at`/`agreement_version` columns ✓ Task 1, `seller_documents` table + storage bucket ✓ Task 1).

Once this passes, Phase 2 (rider-facing seller directory) gets its own plan the same way — do not start writing Phase 2 code inside this plan's tasks.
