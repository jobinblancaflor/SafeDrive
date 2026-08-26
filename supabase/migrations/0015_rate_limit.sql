-- 0015_rate_limit.sql
-- Fixed-window rate limiting backed by Postgres, for endpoints that accept
-- anonymous/device requests (no session to key a limiter off of) and can't
-- rely on in-memory counters since the app runs on serverless (no shared
-- memory across invocations/regions).

create table if not exists public.rate_limit_counters (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

-- No RLS policies on purpose: this table is only ever touched through the
-- SECURITY DEFINER function below, never directly via PostgREST.
alter table public.rate_limit_counters enable row level security;

-- Atomically checks-and-increments a fixed window counter in one statement
-- (the ON CONFLICT branch is a single atomic operation per row in Postgres,
-- so concurrent requests for the same key can't race each other into both
-- reading "under the limit" before either writes). Returns true if this
-- call is within the allowed count for the current window, false if not
-- (caller should reject the request with 429).
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  insert into public.rate_limit_counters (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case
      when rate_limit_counters.window_start <= v_now - make_interval(secs => p_window_seconds)
        then 1
      else rate_limit_counters.count + 1
    end,
    window_start = case
      when rate_limit_counters.window_start <= v_now - make_interval(secs => p_window_seconds)
        then v_now
      else rate_limit_counters.window_start
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

-- PUBLIC (anon/authenticated) needs EXECUTE to call this from
-- session-less/anonymous routes; the function itself is the only access
-- path into the table, so this doesn't widen what callers can actually do.
grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated;

-- Periodic cleanup isn't required for correctness (stale rows just get
-- reset on next use), but keeps the table from growing unbounded with
-- one-off keys (e.g. per-IP) that are never seen again.
create or replace function public.prune_rate_limit_counters()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_counters where window_start < now() - interval '1 day';
$$;
