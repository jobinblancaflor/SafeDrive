import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { acknowledgeIncident, requireStaffSession } from "@/lib/incident-assignment";

// Assigns an incident to a staff member (admin or authority), or clears the
// assignment with assignee_id: null. Assigning also acknowledges it.
const Body = z.object({ assignee_id: z.string().uuid().nullable() });

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requireStaffSession();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const assigneeId = parsed.data.assignee_id;

  if (assigneeId) {
    // profiles RLS only lets admins read other profiles, so check the
    // assignee's role with the service-role client.
    const { data: assignee } = await createAdminClient()
      .from("profiles")
      .select("role")
      .eq("id", assigneeId)
      .maybeSingle();
    if (assignee?.role !== "admin" && assignee?.role !== "authority") {
      return NextResponse.json({ error: "assignee must be an admin or authority" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("incidents")
    .update({
      assigned_to: assigneeId,
      assigned_at: assigneeId ? new Date().toISOString() : null,
      read: true,
    })
    .eq("id", ctx.params.id)
    .select("id, assigned_to, assigned_at")
    .maybeSingle();
  if (error) {
    console.error("incident/[id]/assign failed:", error);
    return NextResponse.json({ error: "failed to assign" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (assigneeId) await acknowledgeIncident(supabase, ctx.params.id, user.id);

  await supabase.from("logs").insert({
    actor: user.id,
    action: "incident.assign",
    entity: "incident",
    entity_id: ctx.params.id,
    meta: { assignee_id: assigneeId },
  });

  return NextResponse.json({ data });
}
