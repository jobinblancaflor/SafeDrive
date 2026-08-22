import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { AuthedShell } from "@/components/nav/authed-shell";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = createClient();
  const { count: unreadCount } = await supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  return (
    <AuthedShell profile={profile} unreadCount={unreadCount ?? 0}>
      {children}
    </AuthedShell>
  );
}
