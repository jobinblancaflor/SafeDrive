import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({
  email: z.string().email(),
  fullname: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  role: z.enum(["rider", "admin", "authority", "seller"]).default("rider"),
});

export async function POST(req: Request) {
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
  const { email, fullname, phone, role } = parsed.data;

  const admin = createAdminClient();
  const redirectTo =
    process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/reset-password`
      : undefined;

  // handle_new_user() reads fullname/phone/role from user_metadata and
  // creates the profiles row, so no separate insert/update is needed here.
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { fullname, phone, role },
    redirectTo,
  });

  if (error) {
    console.error("POST /api/admin/users/invite failed:", error);
    const status = error.status === 422 ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "a user with that email already exists" : "failed to send invite" },
      { status },
    );
  }

  await supabase.from("logs").insert({
    actor: user.id,
    action: "user.invite",
    entity: "profile",
    entity_id: invited.user.id,
    meta: { email, role },
  });

  return NextResponse.json({ ok: true, id: invited.user.id });
}
