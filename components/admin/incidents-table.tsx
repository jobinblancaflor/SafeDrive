import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { IncidentTypeBadge } from "@/components/admin/incident-type-badge";
import type { IncidentType } from "@/lib/incident-type";

export type IncidentRow = {
  id: string;
  occurred_at: string;
  status: "received" | "reported" | "canceled";
  read: boolean;
  incident_type: IncidentType | null;
  user_name: string | null;
};

export function IncidentsTable({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: IncidentRow[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Read</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incidents.map((i) => (
            <TableRow key={i.id} className={selectedId === i.id ? "bg-slate-100" : undefined}>
              <TableCell>{formatDate(i.occurred_at)}</TableCell>
              <TableCell>{i.user_name ?? "—"}</TableCell>
              <TableCell>
                <IncidentTypeBadge type={i.incident_type} size="sm" />
              </TableCell>
              <TableCell>
                <Badge variant={i.status === "reported" ? "success" : i.status === "canceled" ? "destructive" : "warning"}>{i.status}</Badge>
              </TableCell>
              <TableCell>{i.read ? "Yes" : "No"}</TableCell>
              <TableCell className="text-right">
                {onSelect && (
                  <button
                    type="button"
                    onClick={() => onSelect(i.id)}
                    className="mr-2 inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    Details
                  </button>
                )}
                <Link
                  href={`/monitor/${i.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm hover:bg-slate-100"
                >
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
