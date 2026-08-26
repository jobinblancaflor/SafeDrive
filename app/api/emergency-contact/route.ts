import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  fullname: z.string().min(1),
  phone: z.string().min(5),
});

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data, error } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("emergency-contact failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert({ user_id: user.id, ...parsed.data })
    .select()
    .single();

  if (error) {
    console.error("emergency-contact failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
