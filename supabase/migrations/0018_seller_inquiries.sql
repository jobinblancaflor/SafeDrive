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
