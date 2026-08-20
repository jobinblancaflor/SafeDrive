-- 0003_incidents_realtime.sql
-- Broadcast incidents table changes so the admin/authority dashboard can
-- subscribe via Supabase Realtime (postgres_changes). The default
-- `supabase_realtime` publication is used; no replica identity change needed
-- because the consumer only requires `id` on DELETE payloads.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'incidents'
  ) then
    alter publication supabase_realtime add table public.incidents;
  end if;
end $$;
