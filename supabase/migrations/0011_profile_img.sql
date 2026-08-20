-- 0011_profile_img.sql
-- Adds an avatar/profile photo URL to profiles so the incident detail panel
-- (admin/authority) can show who is behind an SOS signal at a glance.
-- Populated by the rider's mobile app (e.g. after uploading to Supabase
-- Storage) or by an admin; nullable, no upload pipeline is created here.

alter table public.profiles
  add column if not exists profile_img text;
