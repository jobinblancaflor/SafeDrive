import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const ESCALATION_STEP_MINUTES = 2;
export const MAX_ESCALATION_LEVEL = 3;

/**
 * Session + staff-role gate for the incident assignment routes. Returns
 * either the cookie-bound client and user, or a NextResponse to return.
 */
export async function requireStaffSession(): Promise<
  { supabase: SupabaseClient; user: User; error?: undefined } | { error: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauth" }, { status: 401 }) };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin" && profile?.role !== "authority") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { supabase, user };
}

/**
 * Marks an incident acknowledged by `userId` if nobody has yet. Any first
 * staff action (acknowledge, assign, status change) counts; this is what
 * stops escalate_stale_incidents() from escalating it further. Only the
 * first acknowledgement is kept.
 */
export async function acknowledgeIncident(
  supabase: SupabaseClient,
  incidentId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("incidents")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
    .eq("id", incidentId)
    .is("acknowledged_at", null);
  if (error) console.error("acknowledgeIncident failed:", error);
}
