-- 0014_seller_profiles.sql
-- Business + service-area details for the "seller" role, filled in via a
-- two-step onboarding wizard (business details, then supported area).

create table if not exists public.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,

  -- Step 1: business details
  business_name text,
  services text[] not null default '{}',
  business_hours jsonb not null default '{}'::jsonb,
  contact_phone text,
  contact_email text,

  -- Step 2: supported area (a search-or-geolocated center + radius)
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

-- Same shape as emergency_contacts: owner manages their own row, staff can
-- read all of them (for admin review / support).
create policy "seller_profile owner all" on public.seller_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "seller_profile staff read" on public.seller_profiles
  for select using (public.is_staff(auth.uid()));
