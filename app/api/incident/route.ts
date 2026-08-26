import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { touchDevice } from "@/lib/incident-ingest";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const Body = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  device_uuid: z.string().optional(),
});

// Legacy create endpoint — POST /api/incidents/report is the current one;
// this stays alive (and hardened the same way) for whatever mobile app
// builds still call it. No session required from the device, so this uses
// the service-role client: RLS's SELECT policy ("incident read": staff or
// the row's own owner) blocks even reading back the row this request just
// inserted, which without bypassing RLS surfaces as the insert itself
// having failed.
export async function POST(req: Request) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const { lng, lat, device_uuid } = parsed.data;

  const supabase = createAdminClient();

  const allowed = await checkRateLimit(supabase, `incident.create:${clientIp(req)}`, {
    max: 10,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const deviceId = device_uuid?.trim() || null;
  await touchDevice(supabase, deviceId, null);

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
