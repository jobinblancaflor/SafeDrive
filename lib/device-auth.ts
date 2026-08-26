import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Shared-secret gate for the mobile app's device-facing endpoints
 * (incident ingest, device registration, ping ack). These have no user
 * session to authenticate with, so without this ANY internet client could
 * inject fake incidents/devices — a real safety-relevant risk, not just a
 * quota one. The mobile app sends the key as the `X-Device-Key` header.
 *
 * Returns a 401/503 NextResponse to short-circuit the route with, or null
 * if the request is authorized and the caller should proceed.
 */
export function requireDeviceKey(req: Request): NextResponse | null {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) {
    // Fail closed on missing config — an unset key should never silently
    // mean "anyone's allowed in".
    console.error("DEVICE_API_KEY is not configured");
    return NextResponse.json({ error: "device ingestion is not configured" }, { status: 503 });
  }

  const provided = req.headers.get("x-device-key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch rather than returning false,
  // and requires the actual attempt (not a length check) to run in
  // constant time to be worth anything — pad the shorter one instead of
  // short-circuiting on length.
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
