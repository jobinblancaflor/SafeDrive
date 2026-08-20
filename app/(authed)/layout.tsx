import Link from "next/link";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { LogoutButton } from "@/components/nav/logout-button";
import { Wordmark } from "@/components/brand/logo";

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = createClient();
  const { count: unreadCount } = await supabase
    .from("incidents")
    .select("id", { count: "exact", head: true })
    .eq("read", false);

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r bg-white flex flex-col">
        <Link href="/" className="h-14 flex items-center px-5 border-b">
          <Wordmark />
        </Link>
        <Sidebar role={profile.role} unreadCount={unreadCount ?? 0} />
        <div className="mt-auto p-4 border-t">
          <LogoutButton />
        </div>
      </aside>
      <div className="flex flex-col">
        <Topbar profile={profile} />
        <main className="flex-1 p-8 bg-slate-50">{children}</main>
      </div>
    </div>
  );
}
