import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserId } from "@/lib/incident-ingest";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Device registration — creates a devices row for (device_uuid, user_id)
// if one doesn't already exist. Idempotent: calling this again for the
// same device_uuid + user_id is a no-op, not a duplicate/error.
//
// No session required from the device — same anonymous trust model as the
// incident ingest endpoints, so this uses the service-role client
// throughout (RLS's "device owner read" only allows the device's own
// owner or staff to read it back, which an anonymous request is neither).
const Body = z.object({
  device_uuid: z.string().trim().min(1),
  user_id: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { device_uuid, user_id } = parsed.data;

  const supabase = createAdminClient();

  const allowed = await checkRateLimit(supabase, `devices.register:${clientIp(req)}`, {
    max: 20,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const resolvedUserId = await resolveUserId(supabase, user_id);

  const { data: existing, error: lookupError } = await supabase
    .from("devices")
    .select("id, device_uuid, user_id, created_at")
    .eq("device_uuid", device_uuid)
    .maybeSingle();
  if (lookupError) {
    console.error("POST /api/devices/register lookup failed:", lookupError);
    return NextResponse.json({ error: "failed to look up device" }, { status: 500 });
  }

  if (existing) {
    if (existing.user_id === resolvedUserId) {
      // Same device_uuid + same user_id already on file — nothing to do.
      return NextResponse.json({ data: existing, created: false });
    }
    // device_uuid exists under a different (or no) user — per spec, only
    // create when no matching (device_uuid, user_id) row exists yet, so
    // this isn't that case. Deliberately not reassigning ownership here;
    // that's a different operation than "register" and shouldn't happen
    // silently off an unauthenticated device call.
    return NextResponse.json({
      data: existing,
      created: false,
      note: "device_uuid already registered to a different user_id; ownership was not changed",
    });
  }

  const { data, error } = await supabase
    .from("devices")
    .insert({ device_uuid, user_id: resolvedUserId })
    .select("id, device_uuid, user_id, created_at")
    .single();

  if (error) {
    console.error("POST /api/devices/register insert failed:", error);
    return NextResponse.json({ error: "failed to create device" }, { status: 500 });
  }

  return NextResponse.json({ data, created: true }, { status: 201 });
}
