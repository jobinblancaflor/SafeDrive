import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { IncidentsView, type EmergencyContact } from "@/components/admin/incidents-view";

export default async function AuthorityIncidentsPage() {
  await requireRole(["authority", "admin"]);
  const supabase = createClient();

  const { data: contacts } = await supabase
    .from("emergency_contacts")
    .select("id, user_id, fullname, phone");

  const contactsByUserId: Record<string, EmergencyContact[]> = ((contacts ?? []) as Array<{
    id: string;
    user_id: string;
    fullname: string;
    phone: string;
  }>).reduce<Record<string, EmergencyContact[]>>((acc, c) => {
    (acc[c.user_id] ||= []).push({ id: c.id, fullname: c.fullname, phone: c.phone });
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Incidents</h1>
        <p className="text-sm text-slate-500">
          Live list of Secure Signal incidents. Defaults to today (UTC).
        </p>
      </div>
      <IncidentsView
        contactsByUserId={contactsByUserId}
      />
    </div>
  );
}
