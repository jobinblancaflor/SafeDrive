import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  status: z.enum(["Active", "Inactive", "Deleted"]),
});

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const targetId = ctx.params.id;
  // Prevent admin from soft-deleting or deactivating their own account — easy
  // way to lock the org out of the dashboard.
  if (targetId === user.id && parsed.data.status !== "Active") {
    return NextResponse.json(
      { error: "cannot change your own status" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ status: parsed.data.status })
    .eq("id", targetId)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  await supabase.from("logs").insert({
    actor: user.id,
    action: "user.status_change",
    entity: "profile",
    entity_id: targetId,
    meta: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true, profile: data });
}
