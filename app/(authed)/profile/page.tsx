import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

export default async function ProfilePage() {
  const user = await requireUser();
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, fullname, phone, role, created_at, profile_img")
    .eq("id", user.id)
    .single();

  const { data: contacts } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Information associated with your Secure Signal account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-4">
            <Avatar src={profile?.profile_img} alt={profile?.fullname ?? "Profile photo"} size={64} />
            <Link href="/settings" className="text-sm font-medium text-primary hover:underline">
              Change photo in Settings
            </Link>
          </div>
          <Field label="Full name" value={profile?.fullname ?? "—"} />
          <Field label="Phone" value={profile?.phone ?? "—"} />
          <Field label="Email" value={user.email ?? "—"} />
          <div>
            <p className="text-xs uppercase text-slate-500">Role</p>
            <Badge className="mt-1">{profile?.role ?? "rider"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency contacts</CardTitle>
          <CardDescription>People we notify when you trigger an incident.</CardDescription>
        </CardHeader>
        <CardContent>
          {contacts?.length ? (
            <ul className="divide-y">
              {contacts.map((c) => (
                <li key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{c.fullname}</p>
                    <p className="text-sm text-slate-500">{c.phone}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 text-sm">No emergency contacts yet — add some in Settings.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
