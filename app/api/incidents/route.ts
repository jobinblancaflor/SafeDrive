import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBearerToken, createBearerClient } from "@/lib/supabase/bearer";
import { isIncidentType, type IncidentType } from "@/lib/incident-type";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function distanceMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(first.lat)) *
      Math.cos(toRadians(second.lat)) *
      Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Staff-only listing of Secure Signal incidents. Powers the admin/authority
// dashboard table + map. Supports filtering by created_at date, status, type,
// and a free-text search across id / fullname / phone.
export async function GET(req: Request) {
  // Web dashboard authenticates via session cookie; a native mobile client
  // (no cookie jar for this domain) sends its Supabase access token as
  // `Authorization: Bearer <token>` instead. Either way, the resulting
  // client carries that identity into every query below, so Postgres RLS
  // (not this route) is what actually scopes a rider to their own
  // incidents versus staff seeing everything — buildQuery() below runs
  // unchanged for both.
  const bearerToken = getBearerToken(req);
  const supabase = bearerToken ? createBearerClient(bearerToken) : createClient();
  const {
    data: { user },
  } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "authority", "rider"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // YYYY-MM-DD (UTC day boundary)
  const from = searchParams.get("from"); // ISO timestamp
  const to = searchParams.get("to"); // ISO timestamp
  const status = searchParams.get("status");
  const type = searchParams.get("type");
  const q = (searchParams.get("q") ?? "").trim();

  // New params
  const sortBy = searchParams.get("sortBy") === "occurred_at" ? "occurred_at" : "created_at";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusParam = searchParams.get("radius"); // meters
  const hasLocationFilter = [latParam, lngParam, radiusParam].some((value) => value !== null);
  const lat = Number(latParam);
  const lng = Number(lngParam);
  const radius = Number(radiusParam);

  if (
    hasLocationFilter &&
    (!Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(radius) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180 ||
      radius <= 0 ||
      radius > 500_000)
  ) {
    return NextResponse.json({ error: "invalid location filter" }, { status: 400 });
  }

  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT),
  );

  const buildQuery = (includeOccurredAt: boolean) => {
    const incidentFields = includeOccurredAt
      ? "id, occurred_at, created_at, status, read, incident_type, lat, lng, user_id, device_id, profiles!incidents_user_id_fkey(fullname, phone, profile_img)"
      : "id, created_at, status, read, incident_type, lat, lng, user_id, device_id, profiles!incidents_user_id_fkey(fullname, phone, profile_img)";
    const sortField = includeOccurredAt && sortBy === "occurred_at" ? "occurred_at" : "created_at";
    let query = supabase
      .from("incidents")
      .select(incidentFields)
      .order(sortField, { ascending: order === "asc" })
      .limit(limit);

    if (status === "received" || status === "reported" || status === "canceled") {
      query = query.eq("status", status);
    }
    if (isIncidentType(type)) {
      query = query.eq("incident_type", type as IncidentType);
    }
    if (date) {
      // Treat the date as a UTC calendar day.
      const start = `${date}T00:00:00.000Z`;
      const end = `${date}T23:59:59.999Z`;
      query = query.gte("created_at", start).lte("created_at", end);
    } else {
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);
    }
    return query;
  };

  let { data, error } = await buildQuery(true);
  const missingOccurredAt = error?.message.includes("incidents.occurred_at");
  if (error && missingOccurredAt) {
    // Older deployments only have created_at. Keep the API response stable
    // while the database migration is being rolled out.
    ({ data, error } = await buildQuery(false));
  }
  if (error) {
    const missingColumn = /column .*incidents\.\w+ does not exist/.test(error.message);
    return NextResponse.json(
      {
        error: missingColumn
          ? `${error.message}. This usually means the Supabase project is missing one or more migrations from supabase/migrations — run them in numeric order (0001 through 0010).`
          : error.message,
      },
      { status: 500 },
    );
  }

  type Row = {
    id: string;
    occurred_at?: string;
    created_at: string;
    status: "received" | "reported" | "canceled";
    read: boolean;
    incident_type: IncidentType | null;
    lat: number | null;
    lng: number | null;
    user_id: string | null;
    device_id: string | null;
    profiles: { fullname: string; phone: string | null; profile_img: string | null } | null;
  };

  let rows = (data ?? []) as unknown as Row[];

  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => {
      return [r.id, r.profiles?.fullname ?? "", r.profiles?.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }

  if (hasLocationFilter) {
    const center = { lat, lng };
    rows = rows.filter((row) => {
      const point = row.lat !== null && row.lng !== null
        ? { lat: row.lat, lng: row.lng }
        : null;
      return point !== null && distanceMeters(point, center) <= radius;
    });
  }

  // incidents.device_id already holds the hardware's own device_uuid
  // directly (a text column, not a uuid FK to devices.id, despite what the
  // original migration files describe — the live schema has drifted from
  // them; see lib/incident-ingest.ts for the full story). No lookup
  // needed: it *is* the device_uuid.
  const incidents = rows.map((r) => ({
    id: r.id,
    occurred_at: r.occurred_at ?? r.created_at,
    created_at: r.created_at,
    status: r.status,
    read: r.read,
    incident_type: r.incident_type ?? null,
    lat: r.lat,
    lng: r.lng,
    user_id: r.user_id,
    device_id: r.device_id,
    user_name: r.profiles?.fullname ?? null,
    user_phone: r.profiles?.phone ?? null,
    user_profile_img: r.profiles?.profile_img ?? null,
    device_uuid: r.device_id,
  }));

  return NextResponse.json({ incidents, total: incidents.length });
}
