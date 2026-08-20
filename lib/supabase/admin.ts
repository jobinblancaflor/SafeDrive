import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Use only in trusted server contexts
// (webhooks, admin scripts). Never import this in a client component.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
