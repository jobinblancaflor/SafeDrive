import { redirect } from "next/navigation";
import { getProfile } from "@/lib/rbac";
import { LandingPage } from "@/components/marketing/landing-page";

export default async function Home() {
  const profile = await getProfile();
  if (profile) {
    if (profile.role === "admin") redirect("/admin/users");
    if (profile.role === "authority") redirect("/authority/monitor");
    redirect("/profile");
  }
  return <LandingPage />;
}
