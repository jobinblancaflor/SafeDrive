-- Secure Signal Admin — initial schema
-- Run via Supabase CLI: supabase db push  (or paste into SQL editor)

-- ============ Enums ============
create type user_role as enum ('rider','admin','authority');
create type incident_status as enum ('received','reported');
create type ping_status as enum ('sent','received');
create type subscription_status as enum ('active','past_due','canceled','incomplete');

-- ============ profiles (extends auth.users) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  fullname text not null,
  phone text unique,
  role user_role not null default 'rider',
  created_at timestamptz not null default now()
);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, fullname, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'fullname', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'rider')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ emergency_contacts ============
create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fullname text not null,
  phone text not null,
  created_at timestamptz not null default now()
);
create index on public.emergency_contacts (user_id);

-- ============ devices ============
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  device_uuid text unique not null,
  user_id uuid references public.profiles(id) on delete set null,
  ip text,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
create index on public.devices (user_id);

-- ============ notifications (FCM tokens) ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  device_firebase_id text not null,
  created_at timestamptz not null default now()
);
create index on public.notifications (device_id);

-- ============ incidents ============
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  location geography(Point, 4326) not null,
  user_id uuid references public.profiles(id) on delete set null,
  device_id uuid references public.devices(id) on delete set null,
  status incident_status not null default 'received',
  read boolean not null default false,
  occurred_at timestamptz not null default now()
);
create index on public.incidents using gist (location);
create index on public.incidents (occurred_at desc);
create index on public.incidents (status);

-- ============ pings ============
create table public.pings (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  ping_date timestamptz not null default now(),
  status ping_status not null default 'sent'
);
create index on public.pings (device_id, ping_date desc);

-- ============ contacts (form submissions) ============
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ============ subscriptions ============
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id text unique not null,
  status subscription_status not null,
  start timestamptz not null,
  "end" timestamptz,
  created_at timestamptz not null default now()
);
create index on public.subscriptions (user_id);

-- ============ logs ============
create table public.logs (
  id bigserial primary key,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on public.logs (created_at desc);

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.devices enable row level security;
alter table public.notifications enable row level security;
alter table public.incidents enable row level security;
alter table public.pings enable row level security;
alter table public.contacts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.logs enable row level security;

-- Helper: is_admin / is_authority
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.profiles where id = uid and role = 'admin');
$$;

create or replace function public.is_staff(uid uuid)
returns boolean language sql stable as $$
  select exists(select 1 from public.profiles where id = uid and role in ('admin','authority'));
$$;

-- profiles
create policy "profile self read" on public.profiles for select using (auth.uid() = id or public.is_admin(auth.uid()));
create policy "profile self update" on public.profiles for update using (auth.uid() = id);
create policy "profile admin update" on public.profiles for update using (public.is_admin(auth.uid()));
create policy "profile admin insert" on public.profiles for insert with check (public.is_admin(auth.uid()) or auth.uid() = id);

-- emergency_contacts
create policy "ec owner all" on public.emergency_contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "ec staff read" on public.emergency_contacts for select using (public.is_staff(auth.uid()));

-- devices
create policy "device owner read" on public.devices for select using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "device owner update" on public.devices for update using (user_id = auth.uid() or public.is_staff(auth.uid()));
create policy "device insert" on public.devices for insert with check (true);

-- notifications
create policy "notif owner read" on public.notifications for select using (
  exists(select 1 from public.devices d where d.id = notifications.device_id and (d.user_id = auth.uid() or public.is_staff(auth.uid())))
);
create policy "notif insert" on public.notifications for insert with check (true);

-- incidents
create policy "incident insert" on public.incidents for insert with check (true);
create policy "incident read" on public.incidents for select using (public.is_staff(auth.uid()) or user_id = auth.uid());
create policy "incident update" on public.incidents for update using (public.is_staff(auth.uid()));
create policy "incident delete" on public.incidents for delete using (public.is_admin(auth.uid()));

-- pings
create policy "ping insert" on public.pings for insert with check (true);
create policy "ping read" on public.pings for select using (public.is_staff(auth.uid()) or
  exists(select 1 from public.devices d where d.id = pings.device_id and d.user_id = auth.uid()));
create policy "ping update" on public.pings for update using (true);

-- contacts (form submissions)
create policy "contact public insert" on public.contacts for insert with check (true);
create policy "contact admin read" on public.contacts for select using (public.is_admin(auth.uid()));

-- subscriptions
create policy "sub self read" on public.subscriptions for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
create policy "sub admin write" on public.subscriptions for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- logs
create policy "log staff read" on public.logs for select using (public.is_staff(auth.uid()));
create policy "log write" on public.logs for insert with check (true);
