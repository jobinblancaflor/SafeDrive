import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Approve or reject a seller's business documents. [id] is the seller's
// user id (seller_profiles.user_id). seller_profiles has no staff UPDATE
// RLS policy, so after the admin role check the write goes through the
// service-role client.
const Body = z
  .object({
    status: z.enum(["approved", "rejected", "pending"]),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.status !== "rejected" || (b.note && b.note.length > 0), {
    message: "A reason is required when rejecting.",
    path: ["note"],
  });

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid body" },
      { status: 400 },
    );
  }
  const { status, note } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("seller_profiles")
    .update({
      verification_status: status,
      verification_note: status === "rejected" ? note : (note ?? null),
      verified_at: status === "pending" ? null : new Date().toISOString(),
      verified_by: status === "pending" ? null : user.id,
    })
    .eq("user_id", ctx.params.id)
    .not("onboarding_completed_at", "is", null)
    .select("user_id, verification_status, verification_note, verified_at")
    .maybeSingle();

  if (error) {
    console.error("admin/sellers verification update failed:", error);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true, seller: data });
}
