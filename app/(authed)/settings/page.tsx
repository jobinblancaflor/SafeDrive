import { requireUser } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PasswordForm } from "@/components/auth/password-form";
import { EmergencyContactForm } from "@/components/auth/emergency-contact-form";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const { data: contacts } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your name and phone.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            userId={user.id}
            initial={{
              fullname: profile?.fullname ?? "",
              phone: profile?.phone ?? "",
              profile_img: profile?.profile_img ?? null,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change your sign-in password.</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency contacts</CardTitle>
          <CardDescription>Add or remove people to notify in an incident.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmergencyContactForm mode="self" initial={contacts ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Irreversible account actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountSection />
        </CardContent>
      </Card>
    </div>
  );
}
