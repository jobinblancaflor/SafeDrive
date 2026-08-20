import { notFound } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function AdminPaymentDetail({ params }: { params: { id: string } }) {
  await requireRole(["admin"]);
  const supabase = createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*, profiles!subscriptions_user_id_fkey(fullname, phone)")
    .eq("id", params.id)
    .single();
  if (!sub) notFound();

  const user = (sub as unknown as { profiles: { fullname: string; phone: string | null } | null }).profiles;

  // profiles has no email column (auth.users owns that) — look it up via the
  // service-role admin client so the detail page can still show it.
  let email: string | null = null;
  if (sub.user_id) {
    const admin = createAdminClient();
    const { data: authUser } = await admin.auth.admin.getUserById(sub.user_id);
    email = authUser?.user?.email ?? null;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Stripe-driven subscription details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="User" value={user?.fullname ?? "—"} />
          <Field label="Email" value={email ?? "—"} />
          <Field label="Phone" value={user?.phone ?? "—"} />
          <div>
            <p className="text-xs uppercase text-slate-500">Status</p>
            <Badge className="mt-1" variant={sub.status === "active" ? "success" : sub.status === "past_due" ? "warning" : "secondary"}>
              {sub.status}
            </Badge>
          </div>
          <Field label="Subscription ID" value={sub.subscription_id} />
          <Field label="Start" value={formatDate(sub.start)} />
          <Field label="End" value={sub.end ? formatDate(sub.end) : "—"} />
          <Field label="Created" value={formatDate(sub.created_at)} />
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