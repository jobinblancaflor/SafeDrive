"use client";

import { useEffect, useState } from "react";
import { MapPin, Clock } from "lucide-react";
import { PingMap, type MapIncident } from "@/components/map/incident-map";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { IncidentTypeBadge } from "@/components/admin/incident-type-badge";
import { IncidentMessages, type IncidentMessage } from "@/components/admin/incident-messages";
import type { IncidentType } from "@/lib/incident-type";

export type IncidentLogRow = {
  id: string;
  created_at: string;
  lat: number | null;
  lng: number | null;
};

type IncidentStatus = "received" | "reported" | "canceled";

type IncidentBundle = {
  id: string;
  status: IncidentStatus;
  read: boolean;
  incident_type: IncidentType | null;
  occurred_at: string;
  user: { fullname: string; phone: string | null; profile_img?: string | null } | null;
  device: { id: string; device_uuid: string } | null;
};

type StopResult =
  | { kind: "ok" }
  | { kind: "error"; message: string }
  | null;

export function IncidentMonitorView({
  incident,
  initialLogs,
  initialPoint,
  currentUserId,
  initialMessages,
}: {
  incident: IncidentBundle;
  initialLogs: IncidentLogRow[];
  initialPoint: { lat: number; lng: number } | null;
  currentUserId: string;
  initialMessages: IncidentMessage[];
}) {
  const [logs, setLogs] = useState<IncidentLogRow[]>(initialLogs);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(initialPoint);
  const [status, setStatus] = useState<IncidentStatus>(incident.status);
  const [stopPending, setStopPending] = useState(false);
  const [stopResult, setStopResult] = useState<StopResult>(null);
  const [statusPending, setStatusPending] = useState(false);

  async function changeStatus(next: IncidentStatus) {
    setStatusPending(true);
    try {
      const res = await fetch(`/api/incident/${incident.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) setStatus(next);
    } finally {
      setStatusPending(false);
    }
  }

  // Kept for parity with MapIncident naming; not consumed here directly.
  const _mapMarker: MapIncident | null = point
    ? {
        id: incident.id,
        status,
        read: incident.read,
        occurred_at: incident.occurred_at,
        lat: point.lat,
        lng: point.lng,
      }
    : null;
  void _mapMarker;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`incident-${incident.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "incident_logs",
          // incident_logs.device_id stores devices.device_uuid (text), not devices.id.
          filter: incident.device
            ? `incident_id=eq.${incident.id},device_id=eq.${incident.device.device_uuid}`
            : `incident_id=eq.${incident.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            created_at: string;
            lat: number | null;
            lng: number | null;
          };
          setLogs((prev) => [
            { id: row.id, created_at: row.created_at, lat: row.lat, lng: row.lng },
            ...prev,
          ]);
          if (typeof row.lat === "number" && typeof row.lng === "number") {
            setPoint({ lat: row.lat, lng: row.lng });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "incidents",
          filter: `id=eq.${incident.id}`,
        },
        (payload) => {
          const row = payload.new as { status?: IncidentStatus };
          if (row.status) setStatus(row.status);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [incident.id, incident.device]);

  async function onStop() {
    setStopPending(true);
    setStopResult(null);
    try {
      const res = await fetch(`/api/incidents/${incident.id}/stop`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStopResult({ kind: "error", message: json.error ?? "Push failed" });
      } else {
        setStopResult({ kind: "ok" });
      }
    } catch (err) {
      console.error(err);
      setStopResult({ kind: "error", message: "Network error" });
    } finally {
      setStopPending(false);
    }
  }

  const noDevice = !incident.device;
  const phone = incident.user?.phone ?? null;
  const fullname = incident.user?.fullname ?? "Unknown user";
  const shortId = incident.id.slice(0, 8);

  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden">
      <div className="absolute inset-0 lg:left-0 lg:right-[320px]">
        <PingMap point={point} />
      </div>

      <div className="absolute left-4 top-4 z-10 max-w-sm rounded-lg border bg-white/95 p-4 shadow-md backdrop-blur space-y-3">
        <div className="flex items-start gap-3">
          <Avatar src={incident.user?.profile_img} alt={fullname} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{fullname}</p>
            <p className="truncate text-xs text-slate-500">{phone ?? "—"}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={status === "reported" ? "success" : status === "canceled" ? "destructive" : "warning"}>{status}</Badge>
            <IncidentTypeBadge type={incident.incident_type} size="sm" />
          </div>
        </div>

        <div className="space-y-1 text-xs text-slate-600">
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            <span className="font-mono">Incident {shortId}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            <span>{formatDate(incident.occurred_at)}</span>
          </p>
          {incident.device && (
            <p className="flex items-center gap-1.5">
              <span className="text-slate-400">device:</span>
              <span className="font-mono">{incident.device.device_uuid.slice(0, 8)}</span>
            </p>
          )}
        </div>

        {noDevice && (
          <p className="text-xs text-slate-500">No device linked to this incident.</p>
        )}

        <div className="flex gap-2">
          {status === "received" ? (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => changeStatus("reported")}
              disabled={statusPending}
            >
              Mark reported
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => changeStatus("received")}
              disabled={statusPending}
            >
              Reopen
            </Button>
          )}
          {status !== "canceled" && (
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => changeStatus("canceled")}
              disabled={statusPending}
            >
              Cancel
            </Button>
          )}
        </div>

        <Button
          variant="destructive"
          className="w-full"
          onClick={onStop}
          disabled={stopPending || noDevice}
        >
          {stopPending ? "Sending…" : "STOP EMERGENCY"}
        </Button>
        {stopResult?.kind === "ok" && (
          <p className="text-xs text-status-success">Push sent.</p>
        )}
        {stopResult?.kind === "error" && (
          <p className="text-xs text-status-critical">{stopResult.message}</p>
        )}
      </div>

      <aside className="absolute right-0 top-0 z-0 h-full w-full border-l bg-white lg:w-[320px] lg:z-10">
        <div className="flex h-full flex-col">
          <div className="h-1/2 min-h-0 border-b">
            <IncidentMessages
              incidentId={incident.id}
              currentUserId={currentUserId}
              initialMessages={initialMessages}
            />
          </div>
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">Incident Logs</p>
            <p className="text-xs text-slate-500">
              {logs.length} record{logs.length === 1 ? "" : "s"}, newest first
            </p>
          </div>
          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Lat</TableHead>
                  <TableHead className="text-right">Lng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">
                      {formatDate(l.created_at)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {typeof l.lat === "number" ? l.lat.toFixed(5) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {typeof l.lng === "number" ? l.lng.toFixed(5) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </aside>
    </div>
  );
}
