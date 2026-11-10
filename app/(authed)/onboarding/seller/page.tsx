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
      {sellerProfile?.onboarding_completed_at ? (
        <VerificationBanner
          status={(sellerProfile as SellerProfile).verification_status}
          note={(sellerProfile as SellerProfile).verification_note}
        />
      ) : null}
      <SellerOnboardingWizard
        userId={profile.id}
        initial={sellerProfile as SellerProfile | null}
        initialDocuments={(documents ?? []) as SellerDocument[]}
      />
    </div>
  );
}

function VerificationBanner({
  status,
  note,
}: {
  status: SellerProfile["verification_status"];
  note: string | null;
}) {
  if (status === "approved") {
    return (
      <div className="rounded-md border border-status-success/30 bg-status-success/10 p-4 text-sm text-status-success">
        Your business is verified and listed in the service directory.
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="rounded-md border border-status-critical/30 bg-status-critical/10 p-4 text-sm text-status-critical">
        <p className="font-medium">Your documents were not approved.</p>
        {note ? <p className="mt-1">Reason: {note}</p> : null}
        <p className="mt-1">Update your details or documents below and our team will review them again.</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-status-warning/30 bg-status-warning/10 p-4 text-sm text-status-warning">
      Your documents are under review. You&apos;ll appear in the service directory once our team approves them.
    </div>
  );
}
