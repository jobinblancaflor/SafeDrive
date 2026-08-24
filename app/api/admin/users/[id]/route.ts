import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  fullname: z.string().trim().min(1),
  phone: z.string().trim().min(1).nullable(),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
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
  const { data, error } = await supabase
    .from("profiles")
    .update({ fullname: parsed.data.fullname, phone: parsed.data.phone })
    .eq("id", targetId)
    .select("id, fullname, phone")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  await supabase.from("logs").insert({
    actor: user.id,
    action: "user.details_change",
    entity: "profile",
    entity_id: targetId,
    meta: { fullname: parsed.data.fullname, phone: parsed.data.phone },
  });

  return NextResponse.json({ ok: true, profile: data });
}
