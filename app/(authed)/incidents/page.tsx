import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { IncidentsTable, type IncidentRow } from "@/components/admin/incidents-table";
import type { IncidentType } from "@/lib/incident-type";

export default async function MyIncidentsPage() {
  const profile = await requireProfile();
  const supabase = createClient();

  const { data, error } = await supabase
    .from("incidents")
    .select("id, occurred_at, status, read, incident_type")
    .eq("user_id", profile.id)
    .order("occurred_at", { ascending: false })
    .limit(200);

  const incidents: IncidentRow[] = (error ? [] : data ?? []).map((i) => ({
    id: i.id,
    occurred_at: i.occurred_at,
    status: i.status,
    read: i.read,
    incident_type: (i.incident_type ?? null) as IncidentType | null,
    user_name: null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My Incidents</h1>
        <p className="text-sm text-slate-500">SOS incidents you&apos;ve triggered.</p>
      </div>
      {incidents.length === 0 ? (
        <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">
          No incidents yet.
        </div>
      ) : (
        <IncidentsTable incidents={incidents} showUser={false} showActions={false} />
      )}
    </div>
  );
}
