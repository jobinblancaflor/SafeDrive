-- 0004_profile_status.sql
-- Soft-delete + active/inactive state for Secure Signal user profiles.
-- Existing rows default to 'Active' so behavior stays the same for everyone.

alter table public.profiles
  add column if not exists status text not null default 'Active'
    check (status in ('Active', 'Inactive', 'Deleted'));

create index if not exists profiles_status_idx on public.profiles (status);
