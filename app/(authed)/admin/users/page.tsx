import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { UsersView, type AdminUserRow } from "@/components/admin/users-view";

export default async function AdminUsersPage() {
  const profile = await requireRole(["admin"]);
  const supabase = createClient();

  const { data: rows } = await supabase
    .from("profiles")
    .select("id, fullname, phone, role, status, created_at")
    .order("created_at", { ascending: false });

  const users: AdminUserRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    fullname: r.fullname,
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
