import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/rbac";
import { createAdminClient } from "@/lib/supabase/admin";

// Promotes the caller to the "seller" role once their onboarding data is
// complete. Uses the service-role client deliberately: profiles.role is not
// something a regular client update should ever be able to set (see
// "profile self update" RLS policy, which — separately from this route —
// doesn't restrict which columns a self-update may touch). Routing the
// transition through here, with server-side validation of the seller
// profile's required fields, keeps that a non-issue for this flow.
export async function POST() {
  const profile = await requireProfile();
  if (profile.role !== "rider" && profile.role !== "seller") {
    return NextResponse.json(
      { error: "This role can't start seller onboarding." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: sellerProfile, error: fetchError } = await admin
    .from("seller_profiles")
    .select("business_name, services, area_lat, area_lng, area_radius_meters")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (fetchError) {
    console.error("seller onboarding complete: fetch failed", fetchError);
    return NextResponse.json({ error: "Could not load your business profile." }, { status: 500 });
  }
  if (
    !sellerProfile?.business_name ||
    !sellerProfile.services?.length ||
    sellerProfile.area_lat == null ||
    sellerProfile.area_lng == null ||
    sellerProfile.area_radius_meters == null
  ) {
    return NextResponse.json(
      { error: "Finish both onboarding steps before submitting." },
      { status: 400 },
    );
  }

  const { error: completeError } = await admin
    .from("seller_profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("user_id", profile.id);
  if (completeError) {
    console.error("seller onboarding complete: stamp failed", completeError);
    return NextResponse.json({ error: "Could not finish onboarding." }, { status: 500 });
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: "seller" })
    .eq("id", profile.id);
  if (roleError) {
    console.error("seller onboarding complete: role update failed", roleError);
    return NextResponse.json({ error: "Could not finish onboarding." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
