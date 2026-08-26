import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { touchDevice } from "@/lib/incident-ingest";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit } from "@/lib/rate-limit";

const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  device_uuid: z.string().optional(),
});

// Legacy breadcrumb endpoint — POST /api/incidents/log is the current one;
// this stays alive (and hardened the same way) for whatever mobile app
// builds still call it. No session required from the device, so this uses
// the service-role client throughout — same RETURNING/RLS reasoning as
// POST /api/incident.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { lat, lng, device_uuid } = parsed.data;

  const supabase = createAdminClient();

  const { data: incident, error: incidentErr } = await supabase
    .from("incidents")
    .select("id, user_id, device_id")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (incidentErr || !incident) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }

  const allowed = await checkRateLimit(supabase, `incident.track:${incident.id}`, {
    max: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const deviceId = incident.device_id || device_uuid?.trim() || null;
  await touchDevice(supabase, deviceId, incident.user_id);

  const { data, error } = await supabase
    .from("incident_logs")
    .insert({
      incident_id: incident.id,
      user_id: incident.user_id,
      device_id: deviceId,
      lat,
      lng,
    })
    .select()
    .single();

  if (error) {
    console.error("POST /api/incident/[id]/track failed:", error);
    return NextResponse.json({ error: "failed to record location" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

// Staff-only read of the breadcrumb trail (the monitor page also reads this
// server-side via the Supabase client directly; this endpoint exists for
// parity with the rest of the documented API surface / curl access).
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "authority"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("incident_logs")
    .select("id, created_at, lat, lng")
    .eq("incident_id", ctx.params.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("GET /api/incident/[id]/track failed:", error);
    return NextResponse.json({ error: "failed to load location trail" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
