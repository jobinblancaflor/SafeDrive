import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/rbac";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/");
  return <>{children}</>;
}