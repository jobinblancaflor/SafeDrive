import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type TimelineEventKind =
  | "created"
  | "status"
  | "assign"
  | "acknowledge"
  | "escalated"
  | "stop"
  | "sms"
  | "other";

export type TimelineEvent = {
  id: string;
  at: string;
  kind: TimelineEventKind;
  title: string;
  detail: string | null;
  actor: string | null;
  tone: "neutral" | "good" | "warn" | "bad";
};

type LogRow = {
  id: number;
  actor: string | null;
  action: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

type SmsRow = {
  id: string;
  phone: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  send_at: string;
  sent_at: string | null;
  claimed_at: string | null;
  attempts: number;
  last_error: string | null;
};

// Shows enough of a number to tell contacts apart without putting the
// full emergency-contact number on every staff screen.
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length <= 4 ? phone : `•••${digits.slice(-4)}`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Builds one incident's chronological history from what is already
 * recorded elsewhere — the incident row itself, `logs` entries for this
 * incident (status changes, assignment, acknowledgement, escalation, stop
 * pushes), and `sms_outbox` rows — so there is no separate history table
 * to keep in sync.
 *
 * `supabase` is the caller's own (RLS-scoped) client: logs and sms_outbox
 * are staff-read-only, so a non-staff caller just gets an empty history.
 * Actor names are resolved with the service-role client because
 * `profiles` is admin-read-only and authority users would otherwise see
 * every actor as unknown; only ids that already appear in logs the caller
 * could read are looked up.
 */
export async function loadIncidentTimeline(
  supabase: SupabaseClient,
  incidentId: string,
): Promise<TimelineEvent[]> {
  const [incidentRes, logsRes, smsRes] = await Promise.all([
    supabase
      .from("incidents")
      .select("id, occurred_at, created_at, incident_type")
      .eq("id", incidentId)
      .maybeSingle(),
    supabase
      .from("logs")
      .select("id, actor, action, meta, created_at")
      .eq("entity", "incident")
      .eq("entity_id", incidentId)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("sms_outbox")
      .select("id, phone, status, send_at, sent_at, claimed_at, attempts, last_error")
      .eq("incident_id", incidentId)
      .order("send_at", { ascending: true }),
  ]);

  const incident = incidentRes.data as
    | { id: string; occurred_at: string | null; created_at: string; incident_type: string | null }
    | null;
  if (!incident) return [];

  const logs = (logsRes.data ?? []) as LogRow[];
  const sms = (smsRes.data ?? []) as SmsRow[];

  const ids = new Set<string>();
  for (const l of logs) {
    if (l.actor) ids.add(l.actor);
    const assignee = str(l.meta?.assignee_id);
    if (assignee) ids.add(assignee);
  }
  const names = new Map<string, string>();
  if (ids.size > 0) {
    const { data: people } = await createAdminClient()
      .from("profiles")
      .select("id, fullname")
      .in("id", Array.from(ids));
    for (const p of people ?? []) names.set(p.id, p.fullname);
  }
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "Unknown staff" : null);

  const events: TimelineEvent[] = [
    {
      id: `incident-${incident.id}`,
      at: incident.occurred_at ?? incident.created_at,
      kind: "created",
      title: "Incident reported",
      detail: incident.incident_type,
      actor: null,
      tone: "bad",
    },
  ];

  for (const l of logs) {
    const base = { id: `log-${l.id}`, at: l.created_at, actor: nameOf(l.actor) };
    switch (l.action) {
      case "incident.status": {
        const status = str(l.meta?.status);
        events.push({
          ...base,
          kind: "status",
          title: status ? `Status set to ${status}` : "Status changed",
          detail: null,
          tone: status === "canceled" ? "neutral" : status === "reported" ? "good" : "neutral",
        });
        break;
      }
      case "incident.assign": {
        const assignee = str(l.meta?.assignee_id);
        events.push({
          ...base,
          kind: "assign",
          title: assignee ? `Assigned to ${nameOf(assignee)}` : "Unassigned",
          detail: null,
          tone: "neutral",
        });
        break;
      }
      case "incident.acknowledge":
        events.push({ ...base, kind: "acknowledge", title: "Acknowledged", detail: null, tone: "good" });
        break;
      case "incident.escalated": {
        const level = l.meta?.level;
        events.push({
          ...base,
          kind: "escalated",
          title: typeof level === "number" ? `Escalated to level ${level}` : "Escalated",
          detail: "No staff acknowledgement yet",
          actor: null,
          tone: "warn",
        });
        break;
      }
      case "incident.stop_emergency":
        events.push({ ...base, kind: "stop", title: "Stop-emergency push sent", detail: null, tone: "neutral" });
        break;
      default:
        events.push({ ...base, kind: "other", title: l.action, detail: null, tone: "neutral" });
    }
  }

  for (const s of sms) {
    const to = maskPhone(s.phone);
    const common = { id: `sms-${s.id}`, kind: "sms" as const, actor: null };
    if (s.status === "sent") {
      events.push({ ...common, at: s.sent_at ?? s.send_at, title: `SMS sent to ${to}`, detail: null, tone: "good" });
    } else if (s.status === "failed") {
      events.push({
        ...common,
        at: s.claimed_at ?? s.send_at,
        title: `SMS to ${to} failed`,
        detail: `${s.attempts} attempt${s.attempts === 1 ? "" : "s"}${s.last_error ? ` — ${s.last_error}` : ""}`,
        tone: "bad",
      });
    } else if (s.status === "skipped") {
      events.push({
        ...common,
        at: s.claimed_at ?? s.send_at,
        title: `SMS to ${to} skipped`,
        detail: "Incident was canceled",
        tone: "neutral",
      });
    } else {
      events.push({
        ...common,
        at: s.send_at,
        title: `SMS to ${to} queued`,
        detail: s.status === "sending" ? "Sending now" : "Waiting for its send time",
        tone: "neutral",
      });
    }
  }

  return events.sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  );
}
