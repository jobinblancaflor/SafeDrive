import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffSession } from "@/lib/incident-assignment";

// Lists admins and authorities (id, fullname, role) for the incident
// assignee picker. Staff only. Uses the service-role client because the
// profiles SELECT policy only lets admins read other users' profiles.
export async function GET() {
  const auth = await requireStaffSession();
  if (auth.error) return auth.error;

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, fullname, role")
    .in("role", ["admin", "authority"])
    .order("fullname");
  if (error) {
    console.error("GET /api/staff failed:", error);
    return NextResponse.json({ error: "failed to load staff" }, { status: 500 });
  }
  return NextResponse.json({ staff: data ?? [] });
}
