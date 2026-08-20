import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function AdminPaymentsPage() {
  await requireRole(["admin"]);
  const supabase = createClient();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("*, profiles!subscriptions_user_id_fkey(fullname, phone)")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-slate-500">Stripe-driven subscriptions and statuses.</p>
      </div>
      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs?.map((s) => {
              const user = (s as unknown as { profiles: { fullname: string; phone: string | null } | null }).profiles;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{user?.fullname ?? "—"}</div>
                    <div className="text-xs text-slate-500">{user?.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.subscription_id}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "success" : s.status === "past_due" ? "warning" : "secondary"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(s.start)}</TableCell>
                  <TableCell>{s.end ? formatDate(s.end) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/payments/${s.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm hover:bg-slate-100"
                    >
                      View
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}