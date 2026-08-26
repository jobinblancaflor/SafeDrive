import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Self-service account deletion. profiles.id references auth.users(id) on
// delete cascade, so deleting the auth user cascades through
// emergency_contacts, subscriptions, seller_profiles, incident_messages
// (sender_id), etc. devices/incidents/logs use "on delete set null" by
// design — those rows are safety/audit records meant to survive as
// anonymized history, not personal data tied to the account. Storage
// objects (profile photos) live outside Postgres, so they're cleaned up
// separately below.
export async function POST() {
  const profile = await requireProfile();

  const supabase = createClient();
  await supabase.from("logs").insert({
    actor: profile.id,
    action: "user.self_delete_account",
    entity: "profile",
    entity_id: profile.id,
  });

  const admin = createAdminClient();

  const { data: files } = await admin.storage.from("profile_images").list(profile.id);
  if (files?.length) {
    await admin.storage.from("profile_images").remove(files.map((f) => `${profile.id}/${f.name}`));
  }

  const { error } = await admin.auth.admin.deleteUser(profile.id);
  if (error) {
    console.error("account delete failed:", error);
    return NextResponse.json({ error: "Could not delete your account. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
