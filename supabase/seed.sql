-- Secure Signal Admin — seed data
-- After running 0001_init.sql, create the auth users FIRST via Supabase Auth UI
-- (with the matching emails), then run this file from the SQL editor while
-- signed in as the service role.
--
-- Users to create in Auth UI:
--   admin@securesignal.local       password: Admin123!     fullname: Ada Admin
--   authority@securesignal.local   password: Authority123! fullname: Ana Authority
--   rider1@securesignal.local      password: Rider123!    fullname: Rico Rider
--   rider2@securesignal.local      password: Rider123!    fullname: Rosa Rider
--   rider3@securesignal.local      password: Rider123!    fullname: Ren Rider
--
-- Then run the inserts below.

-- Promote admin/authority rows to non-rider
update public.profiles set role = 'admin'     where id = (select id from auth.users where email = 'admin@securesignal.local');
update public.profiles set role = 'authority' where id = (select id from auth.users where email = 'authority@securesignal.local');

-- Fill missing phones for the seed users
update public.profiles set phone = '+639170000001' where id = (select id from auth.users where email = 'admin@securesignal.local');
update public.profiles set phone = '+639170000002' where id = (select id from auth.users where email = 'authority@securesignal.local');
update public.profiles set phone = '+639170000003' where id = (select id from auth.users where email = 'rider1@securesignal.local');
update public.profiles set phone = '+639170000004' where id = (select id from auth.users where email = 'rider2@securesignal.local');
update public.profiles set phone = '+639170000005' where id = (select id from auth.users where email = 'rider3@securesignal.local');

-- === Devices (5) ===
insert into public.devices (device_uuid, user_id, ip, last_seen) values
  ('dev-uuid-001', (select id from auth.users where email = 'rider1@securesignal.local'), '203.0.113.10', now()),
  ('dev-uuid-002', (select id from auth.users where email = 'rider1@securesignal.local'), '203.0.113.11', now()),
  ('dev-uuid-003', (select id from auth.users where email = 'rider2@securesignal.local'), '203.0.113.12', now()),
  ('dev-uuid-004', (select id from auth.users where email = 'rider3@securesignal.local'), '203.0.113.13', now()),
  ('dev-uuid-005', null,                                                          '203.0.113.14', now());

-- FCM tokens
insert into public.notifications (device_id, device_firebase_id)
select id, 'fake-fcm-token-' || device_uuid from public.devices;

-- === Incidents (50, scattered around Metro Manila) ===
insert into public.incidents (lat, lng, user_id, device_id, status, read, occurred_at)
select
  14.55 + random()*0.15,
  121.0 + random()*0.15,
  (select id from auth.users where email = 'rider1@securesignal.local'),
  (select id from public.devices order by random() limit 1),
  (case when random() < 0.7 then 'received'::incident_status else 'reported'::incident_status end),
  random() < 0.4,
  now() - (random() * interval '7 days')
from generate_series(1, 50);

-- === Contacts (sample submissions) ===
insert into public.contacts (name, email, message) values
  ('Curious User', 'curious@example.com', 'Do you have a family plan?'),
  ('Fleet Manager', 'fleet@example.com', 'We need 50 units for our drivers.');

-- === Sample subscription (no real Stripe sub) ===
insert into public.subscriptions (user_id, subscription_id, status, start, "end")
values
  ((select id from auth.users where email = 'rider1@securesignal.local'), 'sub_test_active',  'active',    now() - interval '30 days', now() + interval '335 days'),
  ((select id from auth.users where email = 'rider2@securesignal.local'), 'sub_test_pastdue', 'past_due', now() - interval '60 days', now() + interval '305 days'),
  ((select id from auth.users where email = 'rider3@securesignal.local'), 'sub_test_canceled','canceled',  now() - interval '90 days', now() - interval '1 day');
