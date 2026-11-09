-- 0021_seller_verification.sql
-- Staff verification of seller business documents before a seller is listed
-- in the rider-facing directory.
--
-- * seller_profiles gains verification_status (pending/approved/rejected),
--   a staff note shown to the seller on rejection, and who/when verified.
-- * Existing onboarding-complete sellers are backfilled as 'approved' so the
--   live directory doesn't suddenly empty out when this lands.
-- * seller_directory now also requires verification_status = 'approved'.
-- * A trigger stops sellers from self-approving: seller_profiles' owner
--   policy is FOR ALL, so without it a seller could update their own
--   verification_status. Non-staff writes keep the old verification values;
--   a rejected seller who edits their profile is moved back to 'pending' so
--   staff see the resubmission in the queue.
-- Idempotent: safe to re-run.

alter table public.seller_profiles
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'seller_profiles_verification_status_check'
  ) then
    alter table public.seller_profiles
      add constraint seller_profiles_verification_status_check
      check (verification_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- One-time backfill: only never-reviewed rows that finished onboarding
-- before this feature existed (fixed cutoff keeps re-runs from approving
-- sellers who onboarded afterwards and are legitimately pending).
update public.seller_profiles
set verification_status = 'approved', verified_at = now()
where onboarding_completed_at is not null
  and onboarding_completed_at < timestamptz '2026-11-10 00:00:00+00'
  and verified_at is null
  and verification_status = 'pending';

create index if not exists seller_profiles_verification_status_idx
  on public.seller_profiles (verification_status);

create or replace function public.seller_profiles_guard_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (server-side admin client) and staff may set anything.
  if auth.role() = 'service_role' or public.is_staff(auth.uid()) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.verification_status := 'pending';
    new.verification_note := null;
    new.verified_at := null;
    new.verified_by := null;
    return new;
  end if;

  new.verification_status := old.verification_status;
  new.verification_note := old.verification_note;
  new.verified_at := old.verified_at;
  new.verified_by := old.verified_by;

  if old.verification_status = 'rejected' then
    new.verification_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists seller_profiles_guard_verification on public.seller_profiles;
create trigger seller_profiles_guard_verification
  before insert or update on public.seller_profiles
  for each row execute function public.seller_profiles_guard_verification();

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
where sp.onboarding_completed_at is not null
  and sp.verification_status = 'approved';

revoke select on public.seller_directory from anon;
grant select on public.seller_directory to authenticated;
