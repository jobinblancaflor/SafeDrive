import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
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

  const targetId = ctx.params.id;
  const admin = createAdminClient();

  const { data: target, error: lookupErr } = await admin.auth.admin.getUserById(targetId);
  if (lookupErr) {
    console.error("reset-password: getUserById failed:", lookupErr);
    return NextResponse.json({ error: "failed to look up user" }, { status: 500 });
  }
  if (!target?.user?.email) {
    return NextResponse.json({ error: "user has no email" }, { status: 404 });
  }

  // Never derive the link origin from request headers (reset-link poisoning).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error("reset-password: NEXT_PUBLIC_SITE_URL is not configured");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  const redirectTo = `${siteUrl.replace(/\/$/, "")}/reset-password`;

  const { error } = await admin.auth.resetPasswordForEmail(target.user.email, {
    redirectTo,
  });
  if (error) {
    console.error("reset-password: resetPasswordForEmail failed:", error);
    return NextResponse.json({ error: "failed to send reset email" }, { status: 500 });
  }

  await supabase.from("logs").insert({
    actor: user.id,
    action: "user.reset_password",
    entity: "profile",
    entity_id: targetId,
    meta: { email: target.user.email },
  });

  return NextResponse.json({ ok: true });
}
