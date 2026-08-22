import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendStopEmergency } from "@/lib/fcm";

export async function POST(_req: Request, ctx: { params: { incident_id: string } }) {
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

  const admin = createAdminClient();

  const { data: incident } = await admin
    .from("incidents")
    .select("id, device_id")
    .eq("id", ctx.params.incident_id)
    .single();
  if (!incident) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!incident.device_id) {
    return NextResponse.json({ error: "incident has no device" }, { status: 409 });
  }

  // incidents.device_id stores devices.device_uuid (text), not devices.id.
  const { data: device } = await admin
    .from("devices")
    .select("id, device_uuid, fcm_id")
    .eq("device_uuid", incident.device_id)
    .single();
  if (!device) return NextResponse.json({ error: "device not found" }, { status: 404 });
  if (!device.fcm_id) {
    return NextResponse.json({ error: "device has no registered push token" }, { status: 409 });
  }

  try {
    await sendStopEmergency(device.fcm_id, device.device_uuid);
  } catch (err) {
    console.error("FCM stop_emergency failed:", err);
    return NextResponse.json({ error: "fcm failed" }, { status: 502 });
  }

  await supabase.from("logs").insert({
    actor: user.id,
    action: "incident.stop_emergency",
    entity: "incident",
    entity_id: ctx.params.incident_id,
    meta: { device_id: device.id, device_uuid: device.device_uuid },
  });

  return NextResponse.json({ ok: true });
}