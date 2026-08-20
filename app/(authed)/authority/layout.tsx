import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/rbac";

export default async function AuthorityLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "authority") redirect("/");
  return <>{children}</>;
}