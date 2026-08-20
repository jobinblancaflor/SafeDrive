import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  device_uuid: z.string().optional(),
});

// Device-side breadcrumb ingestion while an incident is active. Mirrors the
// trust model of POST /api/incident — no session required from the device,
// RLS on incident_logs restricts who can read the trail back. The admin/
// authority monitor view listens for these rows via Supabase Realtime.
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { lat, lng, device_uuid } = parsed.data;

  const supabase = createClient();

  const { data: incident, error: incidentErr } = await supabase
    .from("incidents")
    .select("id, user_id, device_id")
    .eq("id", ctx.params.id)
    .single();
  if (incidentErr || !incident) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }

  let deviceId = incident.device_id ?? null;
  if (!deviceId && device_uuid) {
    const { data: device } = await supabase
      .from("devices")
      .select("id")
      .eq("device_uuid", device_uuid)
      .single();
    deviceId = device?.id ?? null;
  }

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
