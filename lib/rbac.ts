import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";

export type AppRole = "rider" | "admin" | "authority" | "seller";

export type AppProfile = {
  id: string;
  fullname: string;
  phone: string | null;
  role: AppRole;
  created_at: string;
};

export async function getSession() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function getUser() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getProfile(): Promise<AppProfile | null> {
  const user = await getUser();
  if (!user) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, fullname, phone, role, created_at")
    .eq("id", user.id)
    .single();
  if (error || !data) return null;
  return data as AppProfile;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireProfile(): Promise<AppProfile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireRole(roles: AppRole[]): Promise<AppProfile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}

export function isStaff(role: AppRole) {
  return role === "admin" || role === "authority";
}
