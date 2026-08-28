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
