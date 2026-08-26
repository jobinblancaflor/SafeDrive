import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const Body = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  message: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createClient();
  const allowed = await checkRateLimit(supabase, `contact:${clientIp(req)}`, {
    max: 5,
    windowSeconds: 3600,
  });
  if (!allowed) {
    return NextResponse.json({ error: "too many requests, try again later" }, { status: 429 });
  }

  // Anonymous submission: RLS's SELECT policy on contacts only allows
  // admins to read rows back, which means even RETURNING on this insert
  // would fail the same way a rejected write would under the session
  // client. Service-role bypasses that for this one write.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contacts")
    .insert(parsed.data)
    .select()
    .single();
  if (error) {
    console.error("POST /api/contact failed:", error);
    return NextResponse.json({ error: "failed to submit message" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

export async function GET() {
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

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("GET /api/contact failed:", error);
    return NextResponse.json({ error: "failed to load messages" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
