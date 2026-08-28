import { Suspense } from "react";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { PingView } from "@/components/admin/ping-view";

export default async function AuthorityPingPage() {
  await requireRole(["authority", "admin"]);
  const supabase = createClient();
  const { data: devices } = await supabase
    .from("devices")
    .select("id, device_uuid, ip, profiles!devices_user_id_fkey(fullname, phone)")
    .order("created_at", { ascending: false });

  const shaped = (devices ?? []).map((d) => {
    const u = (d as unknown as { profiles: { fullname: string; phone: string | null } | null }).profiles;
    return {
      id: d.id,
      device_uuid: d.device_uuid,
      ip: d.ip,
      user: u ? { fullname: u.fullname, phone: u.phone } : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ping</h1>
        <p className="text-sm text-slate-500">Search a device, view on map, send a ping.</p>
      </div>
      <Suspense fallback={null}>
        <PingView devices={shaped} />
      </Suspense>
    </div>
  );
}