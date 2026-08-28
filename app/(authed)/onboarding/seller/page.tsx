import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { SellerOnboardingWizard } from "@/components/onboarding/seller-onboarding-wizard";
import type { SellerProfile, SellerDocument } from "@/lib/supabase/types";

export default async function SellerOnboardingPage() {
  const profile = await requireProfile();
  if (profile.role !== "rider" && profile.role !== "seller") {
    redirect("/");
  }

  const supabase = createClient();
  const { data: sellerProfile } = await supabase
    .from("seller_profiles")
    .select("*")
    .eq("user_id", profile.id)
    .maybeSingle();

  const { data: documents } = await supabase
    .from("seller_documents")
    .select("*")
    .eq("seller_user_id", profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {sellerProfile?.onboarding_completed_at ? "Business profile" : "Become a seller"}
        </h1>
        <p className="text-sm text-slate-500">
          Tell us about your business and where you operate.
        </p>
      </div>
      <SellerOnboardingWizard
        userId={profile.id}
        initial={sellerProfile as SellerProfile | null}
        initialDocuments={(documents ?? []) as SellerDocument[]}
      />
    </div>
  );
}
