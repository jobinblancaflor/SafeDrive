import { redirect } from "next/navigation";
import { getProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/landing-page";

export default async function Home() {
  const profile = await getProfile();
  if (profile) {
    if (profile.role === "admin") redirect("/admin/users");
    if (profile.role === "authority") redirect("/authority/monitor");
    if (profile.role === "seller") {
      const supabase = createClient();
      const { data: sellerProfile } = await supabase
        .from("seller_profiles")
        .select("onboarding_completed_at")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!sellerProfile?.onboarding_completed_at) redirect("/onboarding/seller");
      redirect("/profile");
    }
    redirect("/profile");
  }
  return <LandingPage />;
}
