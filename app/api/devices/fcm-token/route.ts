import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserId } from "@/lib/incident-ingest";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Updates devices.fcm_id for the row matching BOTH device_uuid AND
// user_id — unlike POST /api/devices/register (which upserts and is
// deliberately lenient about ownership mismatches), this is a strict
// update: no matching (device_uuid, user_id) row means 404, nothing gets
// created. Meant for a device that's already registered refreshing its
// own token, not for first-time registration.
const Body = z.object({
  device_uuid: z.string().trim().min(1),
  user_id: z.string().trim().min(1),
  fcm_token: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { device_uuid, user_id, fcm_token } = parsed.data;

  const supabase = createAdminClient();

  const allowed = await checkRateLimit(supabase, `devices.fcm-token:${clientIp(req)}`, {
    max: 30,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const resolvedUserId = await resolveUserId(supabase, user_id);
  if (!resolvedUserId) {
    // Can't match a row on an owner we can't resolve to a real profile —
    // this is an update endpoint, not a fallback registration path.
    return NextResponse.json({ error: "device not found for this user" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("devices")
    .update({ fcm_id: fcm_token, last_seen: new Date().toISOString() })
    .eq("device_uuid", device_uuid)
    .eq("user_id", resolvedUserId)
    .select("id, device_uuid, user_id, fcm_id, created_at")
    .maybeSingle();

  if (error) {
    console.error("POST /api/devices/fcm-token failed:", error);
    return NextResponse.json({ error: "failed to update device" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "device not found for this user" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
