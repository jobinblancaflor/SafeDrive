import { notFound } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { RoleSelector } from "@/components/admin/role-selector";
import { EmergencyContactForm } from "@/components/auth/emergency-contact-form";

export default async function AdminUserDetail({ params }: { params: { id: string } }) {
  await requireRole(["admin"]);
  const supabase = createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!profile) notFound();

  const { data: contacts } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("user_id", profile.id);
  const { data: devices } = await supabase
    .from("devices")
    .select("*")
    .eq("user_id", profile.id);
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.fullname}</CardTitle>
          <CardDescription>User profile and settings</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Field label="Phone" value={profile.phone ?? "—"} />
          <Field label="Joined" value={formatDate(profile.created_at)} />
          <div>
            <p className="text-xs uppercase text-slate-500">Role</p>
            <RoleSelector userId={profile.id} current={profile.role} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency contacts</CardTitle>
          <CardDescription>Admin-managed. Edits here affect this rider&apos;s profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmergencyContactForm mode="admin" ownerId={profile.id} initial={contacts ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
        </CardHeader>
        <CardContent>
          {devices?.length ? (
            <ul className="divide-y">
              {devices.map((d) => (
                <li key={d.id} className="py-2 flex justify-between">
                  <span className="font-mono text-sm">{d.device_uuid}</span>
                  <span className="text-slate-500 text-sm">{d.ip ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No devices registered.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          {subs?.length ? (
            <ul className="divide-y">
              {subs.map((s) => (
                <li key={s.id} className="py-2 flex justify-between items-center">
                  <span className="font-mono text-sm">{s.subscription_id}</span>
                  <Badge variant={s.status === "active" ? "success" : s.status === "past_due" ? "warning" : "secondary"}>
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No subscriptions.</p>
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