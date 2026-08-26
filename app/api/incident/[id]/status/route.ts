import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ status: z.enum(["received", "reported", "canceled"]) });

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "authority"].includes(profile.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data, error } = await supabase
    .from("incidents")
    .update({ status: parsed.data.status, read: true })
    .eq("id", ctx.params.id)
    .select()
    .single();

  if (error) {
    console.error("incident/[id]/status failed:", error);
    return NextResponse.json({ error: "failed to update status" }, { status: 500 });
  }

  await supabase.from("logs").insert({
    actor: user.id,
    action: "incident.status",
    entity: "incident",
    entity_id: ctx.params.id,
    meta: { status: parsed.data.status },
  });

  return NextResponse.json({ data });
}
