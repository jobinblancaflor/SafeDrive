import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  fullname: z.string().min(1).optional(),
  phone: z.string().min(5).optional(),
});

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data, error } = await supabase
    .from("emergency_contacts")
    .update(parsed.data)
    .eq("id", ctx.params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    console.error("emergency-contact/[id] failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { error } = await supabase
    .from("emergency_contacts")
    .delete()
    .eq("id", ctx.params.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("emergency-contact/[id] failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
