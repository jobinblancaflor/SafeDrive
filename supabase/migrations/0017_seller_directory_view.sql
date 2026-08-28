-- Rider-facing seller directory. A plain (non security_invoker) view owned by
-- a bypass-RLS role: its own column list + WHERE clause IS the entire access
-- boundary, independent of seller_profiles' own RLS. Only onboarding-complete
-- sellers are listed, and contact_phone/contact_email/agreement_* are
-- structurally excluded — not just hidden in the UI, genuinely unqueryable
-- through this view.
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

-- This project grants broad default SELECT privileges to both `anon` and
-- `authenticated` on new public-schema objects. The spec requires NO
-- anonymous/public browsing, so anon access must be revoked explicitly —
-- granting only to `authenticated` is not sufficient on its own.
revoke select on public.seller_directory from anon;
grant select on public.seller_directory to authenticated;
