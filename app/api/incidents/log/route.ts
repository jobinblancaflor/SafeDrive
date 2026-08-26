import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserId, touchDevice } from "@/lib/incident-ingest";

// Incident location breadcrumb (IncidentLogRequest) — sent every ~10s while
// an incident is active. No session required from the device, so this uses
// the service-role client throughout — see the comment in
// app/api/incidents/report/route.ts for why: every read/insert-return this
// route would otherwise need is gated by an RLS policy that only allows
// staff or the row's own owner to see it, which an anonymous device is
// neither.
const Body = z.object({
  incident_id: z.string().uuid(),
  user_id: z.string().optional().nullable(),
  device_id: z.string().optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  const supabase = createAdminClient();

  const { data: incident, error: incidentErr } = await supabase
    .from("incidents")
    .select("id")
    .eq("id", body.incident_id)
    .maybeSingle();
  if (incidentErr || !incident) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }

  const userId = await resolveUserId(supabase, body.user_id);
  const deviceId = body.device_id?.trim() || null;
  await touchDevice(supabase, deviceId, userId);

  const { data, error } = await supabase
    .from("incident_logs")
    .insert({
      incident_id: body.incident_id,
      user_id: userId,
      device_id: deviceId,
      lat: body.lat,
      lng: body.lng,
    })
    .select()
    .single();

  if (error) {
    console.error("POST /api/incidents/log failed:", error);
    return NextResponse.json({ error: "failed to record location" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
