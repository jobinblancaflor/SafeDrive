import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Best-effort IP extraction for rate-limit keying. Vercel sets
 * x-forwarded-for; falls back to a constant so a missing header degrades
 * to "everyone shares one bucket" rather than throwing.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Fixed-window rate limit backed by the check_rate_limit() Postgres
 * function (see supabase/migrations/0015_rate_limit.sql) — atomic across
 * concurrent serverless invocations, unlike an in-memory counter.
 *
 * Fails OPEN (allows the request) if the check itself errors: a
 * rate-limiter outage should never be the reason a safety report gets
 * dropped. The failure is logged so it's still visible.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  opts: { max: number; windowSeconds: number },
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max: opts.max,
    p_window_seconds: opts.windowSeconds,
  });
  if (error) {
    console.error("checkRateLimit failed (failing open):", error);
    return true;
  }
  return data === true;
}
