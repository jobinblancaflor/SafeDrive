import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { AuthedShell } from "@/components/nav/authed-shell";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = createClient();
  let unreadQuery = supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .eq("read", false);
  // Staff see the account-wide unread count; riders only see their own.
  if (profile.role === "rider") {
    unreadQuery = unreadQuery.eq("user_id", profile.id);
  }
  const { count: unreadCount } = await unreadQuery;

  return (
    <AuthedShell profile={profile} unreadCount={unreadCount ?? 0}>
      {children}
    </AuthedShell>
  );
}
