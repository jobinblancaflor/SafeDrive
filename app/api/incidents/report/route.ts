import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIncidentType } from "@/lib/incident-type";
import { resolveUserId, touchDevice } from "@/lib/incident-ingest";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Initial incident report (IncidentRequest) — sent once when an SOS/fall
// trigger first fires. No session required from the device, so this uses
// the service-role client throughout rather than the session-bound one:
// every read this route needs (profiles, devices), and even reading the
// inserted row back via RETURNING, is gated by RLS policies that only
// allow the row's own owner or staff to see it — an anonymous device is
// neither. The service-role client bypasses RLS entirely, which is the
// right trust boundary here: it's this route's own server-side logic
// doing the lookups, not raw table access handed to the caller.
const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  user_id: z.string().optional().nullable(),
  device_id: z.string().optional().nullable(),
  status: z.string().optional(),
  incident_type: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = createAdminClient();

  // Generous cap — this is a safety-report path, err on the side of never
  // blocking a real emergency. Just stops outright flooding.
  const allowed = await checkRateLimit(supabase, `incidents.report:${clientIp(req)}`, {
    max: 10,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const userId = await resolveUserId(supabase, body.user_id);
  const deviceId = body.device_id?.trim() || null;
  await touchDevice(supabase, deviceId, userId);

  // Never let an unrecognized status/incident_type value fail a safety
  // report — fall back to sane defaults instead of a hard 400.
  const status =
    body.status === "received" || body.status === "reported" || body.status === "canceled"
      ? body.status
      : "reported";
  const incidentType = isIncidentType(body.incident_type) ? body.incident_type : null;

  const { data, error } = await supabase
    .from("incidents")
    .insert({
      lat: body.lat,
      lng: body.lng,
      user_id: userId,
      device_id: deviceId,
      status,
      incident_type: incidentType,
    })
    .select()
    .single();

  if (error) {
    console.error("POST /api/incidents/report failed:", error);
    return NextResponse.json({ error: "failed to create incident" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
