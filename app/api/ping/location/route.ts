import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDeviceKey } from "@/lib/device-auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Device reports its location for a specific ping. Uses the service-role
// client for the same reason as PATCH /api/ping: RLS's "ping read" policy
// only allows staff or the device's own owner to read a row back, which an
// anonymous device request is neither — even RETURNING on its own update
// would fail under the session client.
const Body = z.object({
  ping_id: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(),
});

export async function POST(req: Request) {
  const authError = requireDeviceKey(req);
  if (authError) return authError;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const { ping_id, lat, lng, accuracy } = parsed.data;

  const supabase = createAdminClient();

  const allowed = await checkRateLimit(supabase, `ping.location:${clientIp(req)}`, {
    max: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  // A location report proves the device got the ping, so it also counts
  // as the ack — the device app reports location without ever calling
  // PATCH /api/ping, which left every ping stuck at 'sent'.
  const now = new Date().toISOString();
  await supabase
    .from("pings")
    .update({ received_at: now })
    .eq("id", ping_id)
    .is("received_at", null);

  const { data, error } = await supabase
    .from("pings")
    .update({ lat, lng, accuracy: accuracy ?? null, located_at: now, status: "received" })
    .eq("id", ping_id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("POST /api/ping/location failed:", error);
    return NextResponse.json({ error: "failed to update ping location" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "ping not found" }, { status: 404 });
  }

  return NextResponse.json({ data });
}
