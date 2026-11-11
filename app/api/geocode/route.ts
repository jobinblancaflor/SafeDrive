import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

// Thin server-side proxy for Nominatim address search — keeps a proper
// User-Agent/Referer on requests per their usage policy
// (https://operations.osmfoundation.org/policies/nominatim/), which a
// direct client-side fetch can't reliably set.
export async function GET(req: Request) {
  const profile = await requireProfile();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  // Nominatim's policy caps usage at ~1 request/second for the whole app;
  // a per-user cap keeps one tab's search-as-you-type from getting the
  // shared server IP blocked.
  const allowed = await checkRateLimit(createClient(), `geocode:${profile.id}`, {
    max: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ results: [], error: "too many requests" }, { status: 429 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");

  const res = await fetch(url, {
    headers: {
      "user-agent": "SecureSignalAdmin/1.0 (seller onboarding address search)",
    },
  });
  if (!res.ok) {
    return NextResponse.json({ results: [] }, { status: 502 });
  }

  const data = (await res.json()) as Array<{
    display_name: string;
    lat: string;
    lon: string;
  }>;

  return NextResponse.json({
    results: data.map((r) => ({
      label: r.display_name,
      lat: Number(r.lat),
      lng: Number(r.lon),
    })),
  });
}
