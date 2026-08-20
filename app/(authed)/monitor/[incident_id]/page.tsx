import { notFound } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { IncidentMonitorView, type IncidentLogRow } from "@/components/admin/incident-monitor-view";
import type { IncidentType } from "@/lib/incident-type";
import type { IncidentStatus } from "@/lib/supabase/types";

export default async function MonitorIncidentPage({
  params,
}: {
  params: { incident_id: string };
}) {
  await requireRole(["admin", "authority"]);
  const supabase = createClient();

  const { data: incident, error } = await supabase
    .from("incidents")
    .select("id, status, read, incident_type, occurred_at, user_id, device_id, profiles!incidents_user_id_fkey(fullname, phone, profile_img)")
    .eq("id", params.incident_id)
    .single();

  if (error || !incident) notFound();

  const profile = (incident as unknown as {
    profiles: { fullname: string; phone: string | null; profile_img: string | null } | null;
  }).profiles;

  let device: { id: string; device_uuid: string } | null = null;
  if (incident.device_id) {
    // incidents.device_id stores devices.device_uuid (text), not devices.id.
    const { data: dev } = await supabase
      .from("devices")
      .select("id, device_uuid")
      .eq("device_uuid", incident.device_id)
      .maybeSingle();
    device = dev ?? null;
  }

  let logsQuery = supabase
    .from("incident_logs")
    .select("id, created_at, lat, lng")
    .eq("incident_id", params.incident_id);
  if (device) {
    // incident_logs.device_id stores devices.device_uuid (text), not devices.id.
    logsQuery = logsQuery.eq("device_id", device.device_uuid);
  }
  const { data: logs } = await logsQuery
    .order("created_at", { ascending: false })
    .limit(100);

  const initialLogs: IncidentLogRow[] = (logs ?? []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    lat: l.lat,
    lng: l.lng,
  }));

  const latestWithCoords = initialLogs.find(
    (l) => typeof l.lat === "number" && typeof l.lng === "number",
  );
  const initialPoint =
    latestWithCoords && latestWithCoords.lat !== null && latestWithCoords.lng !== null
      ? { lat: latestWithCoords.lat as number, lng: latestWithCoords.lng as number }
      : null;

  return (
    <IncidentMonitorView
      incident={{
        id: incident.id,
        status: incident.status as IncidentStatus,
        read: incident.read,
        incident_type: (incident.incident_type ?? null) as IncidentType | null,
        occurred_at: incident.occurred_at,
        user: profile
          ? { fullname: profile.fullname, phone: profile.phone ?? null, profile_img: profile.profile_img ?? null }
          : null,
        device,
      }}
      initialLogs={initialLogs}
      initialPoint={initialPoint}
    />
  );
}