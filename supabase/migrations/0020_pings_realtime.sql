-- The ping admin page subscribes to `postgres_changes` on `pings` (see
-- components/admin/ping-view.tsx) to live-update the map when a device
-- reports its location — that subscription silently never fires unless
-- the table is added to Supabase's `supabase_realtime` publication.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pings'
  ) then
    alter publication supabase_realtime add table public.pings;
  end if;
end $$;
