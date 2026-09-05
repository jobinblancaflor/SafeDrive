import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { SELLER_SERVICE_OPTIONS } from "@/lib/seller-service-type";

const Body = z.object({
  seller_user_id: z.string().uuid(),
  service_type: z.enum(SELLER_SERVICE_OPTIONS as [string, ...string[]]),
  message: z.string().trim().min(1).max(2000),
});

// Rider-only: creates a lead routed to Secure Signal staff, never to the
// seller — seller_inquiries' RLS has no seller-readable policy at all, so
// this is enforced at the database layer, not just by who this route lets
// call it.
export async function POST(req: Request) {
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
    return NextResponse.json({ error: "only riders can request a service" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const { data: seller } = await supabase
    .from("seller_directory")
    .select("user_id")
    .eq("user_id", parsed.data.seller_user_id)
    .maybeSingle();
  if (!seller) {
    return NextResponse.json({ error: "seller not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("seller_inquiries")
    .insert({
      rider_user_id: user.id,
      seller_user_id: parsed.data.seller_user_id,
      service_type: parsed.data.service_type,
      message: parsed.data.message,
    })
    .select()
    .single();

  if (error) {
    console.error("seller-inquiries insert failed:", error);
    return NextResponse.json({ error: "request failed" }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
