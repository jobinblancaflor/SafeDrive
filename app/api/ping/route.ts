import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPing, describeFcmError } from "@/lib/fcm";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

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
  if (error) {
    console.error("POST /api/ping insert failed:", error);
    return NextResponse.json({ error: "failed to record ping" }, { status: 500 });
  }

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
// trust model as the incident ingest endpoints, so this uses the
// service-role client: RLS's SELECT policy on pings only allows the
// device's own owner or staff to read it back, which an anonymous ack
// request is neither.
export async function PATCH(req: Request) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = z.object({ ping_id: z.string().uuid() }).safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createAdminClient();

  const allowed = await checkRateLimit(supabase, `ping.ack:${clientIp(req)}`, {
    max: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

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
