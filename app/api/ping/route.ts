import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendPing, describeFcmError } from "@/lib/fcm";

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

  const { data: ping, error } = await supabase
    .from("pings")
    .insert({ device_id: parsed.data.device_id, status: "sent" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Look up the device's registered FCM token and send (best-effort — a
  // missing/failed push doesn't fail the ping record itself, but we report
  // whether it actually went out so the UI can tell the admin).
  const { data: device } = await supabase
    .from("devices")
    .select("fcm_id")
    .eq("id", parsed.data.device_id)
    .maybeSingle();

  let pushed = false;
  let pushError: string | undefined;
  if (device?.fcm_id) {
    try {
      await sendPing(device.fcm_id, { pingId: ping.id });
      pushed = true;
    } catch (err) {
      console.error("FCM send failed:", err);
      pushError = describeFcmError(err);
    }
  } else {
    pushError = "device has no registered push token";
  }

  await supabase.from("logs").insert({
    actor: user.id,
    action: "ping.sent",
    entity: "device",
    entity_id: parsed.data.device_id,
    meta: { ping_id: ping.id, pushed },
  });

  return NextResponse.json({ data: ping, pushed, pushError }, { status: 201 });
}

// Device acknowledges a ping — no session required from the device, same
// trust model as POST /api/incident and POST /api/incident/[id]/track. RLS
// ("ping update" with using (true)) allows the anonymous write.
export async function PATCH(req: Request) {
  const parsed = z.object({ ping_id: z.string().uuid() }).safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pings")
    .update({ status: "received" })
    .eq("id", parsed.data.ping_id)
    .select()
    .single();

  if (error) {
    console.error("PATCH /api/ping failed:", error);
    return NextResponse.json({ error: "failed to update ping" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
