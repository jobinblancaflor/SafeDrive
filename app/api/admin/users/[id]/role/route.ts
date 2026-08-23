import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  role: z.enum(["rider", "admin", "authority"]),
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
  // Prevent an admin from demoting themselves out of admin — easy way to
  // lock the org out of the dashboard (same guard as the status route).
  if (targetId === user.id && parsed.data.role !== "admin") {
    return NextResponse.json(
      { error: "cannot change your own role" },
      { status: 409 },
    );
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", targetId)
    .select("id, role")
    .single();

  if (error) {
    console.error("POST /api/admin/users/[id]/role failed:", error);
    return NextResponse.json({ error: "failed to update role" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  await supabase.from("logs").insert({
    actor: user.id,
    action: "user.role_change",
    entity: "profile",
    entity_id: targetId,
    meta: { role: parsed.data.role },
  });

  return NextResponse.json({ ok: true, profile: data });
}
