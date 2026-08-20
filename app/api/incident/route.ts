import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  device_uuid: z.string().optional(),
});

// Devices post incidents directly — no user session required from the device.
// This mirrors the trust model of POST /api/incident/[id]/track and the
// incident_logs insert policy: no API key, RLS ("incident insert" with check
// (true)) allows the anonymous write, and RLS on select restricts who can
// read incidents back (staff or the incident's own user).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { lng, lat, device_uuid } = parsed.data;

  const supabase = createClient();
  let deviceId: string | null = null;
  if (device_uuid) {
    const { data } = await supabase
      .from("devices")
      .select("id")
      .eq("device_uuid", device_uuid)
      .single();
    deviceId = data?.id ?? null;
  }

  const { data, error } = await supabase
    .from("incidents")
    .insert({ lat, lng, device_id: deviceId })
    .select()
    .single();

  if (error) {
    console.error("POST /api/incident failed:", error);
    return NextResponse.json({ error: "failed to create incident" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

// Staff-only listing — mirrors the auth/role gate on GET /api/incidents.
export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // YYYY-MM-DD
  let q = supabase.from("incidents").select("*").order("occurred_at", { ascending: false });
  if (date) {
    const start = `${date}T00:00:00Z`;
    const end = `${date}T23:59:59Z`;
    q = q.gte("occurred_at", start).lte("occurred_at", end);
  }
  const { data, error } = await q.limit(500);
  if (error) {
    console.error("GET /api/incident failed:", error);
    return NextResponse.json({ error: "failed to list incidents" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
