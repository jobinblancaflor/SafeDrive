import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  user_id: z.string().uuid(),
  fullname: z.string().min(1),
  phone: z.string().min(5),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get("user_id");
  const userIdCheck = userIdParam ? z.string().uuid().safeParse(userIdParam) : null;
  if (userIdParam && !userIdCheck?.success) {
    return NextResponse.json({ error: "invalid user_id" }, { status: 400 });
  }
  const userId = userIdCheck?.data ?? null;

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let q = supabase
    .from("emergency_contacts")
    .select("*")
    .order("created_at", { ascending: false });
  if (userId) q = q.eq("user_id", userId);

  const { data, error } = await q;
  if (error) {
    console.error("admin/emergency-contact failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    console.error("admin/emergency-contact failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}