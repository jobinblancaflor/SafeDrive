import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});

// Rider-only, upsert (one review per rider per seller — re-submitting
// edits it). Eligibility ("only if you've inquired about this seller") is
// enforced by seller_reviews' own INSERT policy, not just this check —
// this route's own lookup exists purely to return a clear 403 instead of
// a raw RLS-denial 500/23514 for the common case.
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
  if (profile?.role !== "rider") {
    return NextResponse.json({ error: "only riders can leave a review" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const sellerUserId = ctx.params.id;
  const { data: inquiry } = await supabase
    .from("seller_inquiries")
    .select("id")
    .eq("seller_user_id", sellerUserId)
    .eq("rider_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!inquiry) {
    return NextResponse.json(
      { error: "Contact us about this seller before leaving a review." },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("seller_reviews")
    .upsert(
      {
        seller_user_id: sellerUserId,
        rider_user_id: user.id,
        rating: parsed.data.rating,
        body: parsed.data.body || null,
      },
      { onConflict: "seller_user_id,rider_user_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("sellers/[id]/reviews upsert failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data });
}
