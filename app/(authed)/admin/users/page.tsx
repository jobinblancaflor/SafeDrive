import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { UsersView, type AdminUserRow } from "@/components/admin/users-view";

export default async function AdminUsersPage() {
  const profile = await requireRole(["admin"]);
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("profiles")
    .select("id, fullname, phone, role, status, created_at")
    .order("created_at", { ascending: false });

  const emails = await loadEmailsById();

  const users: AdminUserRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    fullname: r.fullname,
    email: emails.get(r.id) ?? null,
    phone: r.phone ?? null,
    role: r.role,
    status: (r.status ?? "Active") as AdminUserRow["status"],
    created_at: r.created_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-slate-500">All registered Secure Signal users.</p>
      </div>
      <UsersView
        initialUsers={users}
        total={users.length}
        currentUserId={profile.id}
      />
    </div>
  );
}

// Email lives only in auth.users, which the session client can't read —
// fetch it with the service-role client (safe: requireRole above already
// gated this page to admins, and only the email strings reach the client).
async function loadEmailsById(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const emails = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("admin/users: listUsers failed:", error);
      break;
    }
    for (const u of data.users) {
      if (u.email) emails.set(u.id, u.email);
    }
    if (data.users.length < perPage) break;
  }
  return emails;
}
