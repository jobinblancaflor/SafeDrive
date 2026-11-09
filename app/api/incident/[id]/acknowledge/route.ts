import { NextResponse } from "next/server";
import { acknowledgeIncident, requireStaffSession } from "@/lib/incident-assignment";

// Staff acknowledges an incident — stops further escalation.
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requireStaffSession();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  await acknowledgeIncident(supabase, ctx.params.id, user.id);

  const { data, error } = await supabase
    .from("incidents")
    .select("id, acknowledged_at, acknowledged_by, escalation_level")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) {
    console.error("incident/[id]/acknowledge failed:", error);
    return NextResponse.json({ error: "failed to acknowledge" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  await supabase.from("logs").insert({
    actor: user.id,
    action: "incident.acknowledge",
    entity: "incident",
    entity_id: ctx.params.id,
  });

  return NextResponse.json({ data });
}
