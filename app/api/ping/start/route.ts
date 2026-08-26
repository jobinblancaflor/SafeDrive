import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendStartPing, describeFcmError } from "@/lib/fcm";

const Body = z.object({ device_id: z.string().uuid() });

export async function POST(req: Request) {
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

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data: device } = await supabase
    .from("devices")
    .select("device_uuid, fcm_id")
    .eq("id", parsed.data.device_id)
    .maybeSingle();
  if (!device) return NextResponse.json({ error: "device not found" }, { status: 404 });
  if (!device.fcm_id) {
    return NextResponse.json({ error: "device has no registered push token" }, { status: 409 });
  }

  try {
    await sendStartPing(device.fcm_id, device.device_uuid);
  } catch (err) {
    console.error("FCM start_ping failed:", err);
    return NextResponse.json({ error: describeFcmError(err) }, { status: 502 });
  }

  await supabase.from("logs").insert({
    actor: user.id,
    action: "ping.start",
    entity: "device",
    entity_id: parsed.data.device_id,
    meta: { device_uuid: device.device_uuid },
  });

  return NextResponse.json({ ok: true });
}
