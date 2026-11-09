import type { SupabaseClient } from "@supabase/supabase-js";
import { INCIDENT_TYPE_META, isIncidentType } from "@/lib/incident-type";

export const SMS_SPACING_SECONDS = 10;

type IncidentForSms = {
  id: string;
  user_id: string | null;
  lat: number | null;
  lng: number | null;
  incident_type: string | null;
  status: string | null;
};

export function buildEmergencySmsMessage(
  fullname: string | null | undefined,
  incidentType: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string {
  const who = fullname?.trim() || "A Secure Signal user";
  const what = isIncidentType(incidentType) ? INCIDENT_TYPE_META[incidentType].label : "emergency";
  const where = lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : "unknown";
  return `SECURE SIGNAL ALERT: ${who} may need help (${what}). Location: ${where}`;
}

/**
 * Queues one SMS per emergency contact of the incident's rider, contact i
 * due at now + i×10s. Must be called with the service-role client (the
 * outbox has no insert policy). Returns the number of rows queued.
 */
export async function scheduleEmergencySms(
  supabase: SupabaseClient,
  incident: IncidentForSms,
): Promise<number> {
  if (!incident.user_id || incident.status === "canceled") return 0;

  const [{ data: profile }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("profiles").select("fullname").eq("id", incident.user_id).maybeSingle(),
    supabase
      .from("emergency_contacts")
      .select("id, phone")
      .eq("user_id", incident.user_id)
      .order("created_at", { ascending: true }),
  ]);
  if (contactsError) throw contactsError;
  const usable = (contacts ?? []).filter((c) => c.phone?.trim());
  if (!usable.length) return 0;

  const message = buildEmergencySmsMessage(
    profile?.fullname,
    incident.incident_type,
    incident.lat,
    incident.lng,
  );
  const now = Date.now();
  const rows = usable.map((c, i) => ({
    incident_id: incident.id,
    contact_id: c.id,
    phone: c.phone.trim(),
    message,
    send_at: new Date(now + i * SMS_SPACING_SECONDS * 1000).toISOString(),
  }));

  const { error } = await supabase.from("sms_outbox").insert(rows);
  if (error) throw error;
  return rows.length;
}
