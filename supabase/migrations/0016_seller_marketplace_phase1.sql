-- 0016_seller_marketplace_phase1.sql
-- Phase 1 of the seller marketplace: onboarding gains services (already
-- has a text[] column, reused as-is with values constrained by the app's
-- Zod schema rather than a DB check — matches this table's existing
-- convention), required business documents, and service-agreement
-- acceptance.
--
-- Also recreates seller_profiles itself: it existed live earlier in the
-- session that built it (0014_seller_profiles.sql), applied via ad-hoc
-- execute_sql rather than a tracked migration — and was found missing
-- from the live database when this migration was first attempted here.
-- Only test data (a single dev/test row) was lost. Recreated idempotently
-- (`create table if not exists`, guarded policy creation) so re-running
-- this file is always safe whether or not the table already exists.

create table if not exists public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,

  business_name text,
  services text[] not null default '{}',
  business_hours jsonb not null default '{}'::jsonb,
  contact_phone text,
  contact_email text,

  area_label text,
  area_lat double precision,
  area_lng double precision,
  area_radius_meters integer,

  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists seller_profiles_user_id_idx on public.seller_profiles (user_id);

alter table public.seller_profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'seller_profiles' and policyname = 'seller_profile owner all') then
    create policy "seller_profile owner all" on public.seller_profiles
      for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'seller_profiles' and policyname = 'seller_profile staff read') then
    create policy "seller_profile staff read" on public.seller_profiles
      for select using (public.is_staff(auth.uid()));
  end if;
end $$;

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
