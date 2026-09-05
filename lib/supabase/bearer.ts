import { createClient } from "@supabase/supabase-js";

// For endpoints that must work from a native mobile client as well as the
// web dashboard. The web dashboard authenticates via Supabase session
// cookies (lib/supabase/server.ts's createClient, backed by @supabase/ssr)
// — a native app has no cookie jar shared with that domain, so it can't
// use that path at all. Instead it sends its Supabase access token as a
// standard `Authorization: Bearer <token>` header.
//
// The client returned here is NOT a service-role/admin client — it's an
// anon-key client with that token attached to every request, so Postgres
// RLS still applies as that specific user (a rider only ever sees rows
// their own `incident read` policy allows, staff see everything it
// allows) exactly as it would for a cookie-authenticated session. This is
// what makes the same query code safe to reuse across both auth paths.
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function createBearerClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}
