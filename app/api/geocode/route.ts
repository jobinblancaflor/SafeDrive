import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/rbac";

// Thin server-side proxy for Nominatim address search — keeps a proper
// User-Agent/Referer on requests per their usage policy
// (https://operations.osmfoundation.org/policies/nominatim/), which a
// direct client-side fetch can't reliably set.
export async function GET(req: Request) {
  await requireProfile();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
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
