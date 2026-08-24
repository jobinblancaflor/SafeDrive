import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { MonitorView } from "@/components/admin/monitor-view";

// Single shared monitor dashboard for any logged-in staff member (admin or
// authority) — previously duplicated under /admin/monitor and
// /authority/monitor with identical markup; requireRole still gates access
// so riders can never reach it.
export default async function MonitorPage() {
  const profile = await requireRole(["admin", "authority"]);
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: incidents } = await supabase
    .from("incidents")
    .select("*")
    .gte("occurred_at", `${today}T00:00:00Z`)
    .lte("occurred_at", `${today}T23:59:59Z`)
    .order("occurred_at", { ascending: false });

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Monitor</h1>
        <p className="text-sm text-slate-500">Incidents by date. Default is today.</p>
      </div>
      <MonitorView
        initialIncidents={incidents ?? []}
        initialDate={today}
        currentUserId={profile.id}
      />
    </div>
  );
}
