-- 0002_admin_emergency_contact_write.sql
-- Allow admins to insert, update, and delete emergency contacts on behalf of any rider.
-- (Riders keep their existing self-CUD via the `ec owner all` policy.)

drop policy if exists "ec admin write" on public.emergency_contacts;

create policy "ec admin write" on public.emergency_contacts
  for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));