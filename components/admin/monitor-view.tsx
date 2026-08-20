"use client";

import { useState, useTransition } from "react";
import { IncidentMap, type MapIncident } from "@/components/map/incident-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export function MonitorView({
  initialIncidents,
  initialDate,
}: {
  initialIncidents: MapIncident[];
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [incidents, setIncidents] = useState<MapIncident[]>(initialIncidents);
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load() {
    startTransition(async () => {
      const res = await fetch(`/api/incident?date=${date}`);
      const json = await res.json();
      setIncidents(json.data ?? []);
    });
  }

  async function setStatus(id: string, status: "received" | "reported" | "canceled") {
    const res = await fetch(`/api/incident/${id}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setIncidents((arr) => arr.map((i) => (i.id === id ? { ...i, status, read: true } : i)));
    }
  }

  const sel = selected ? incidents.find((i) => i.id === selected) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs uppercase text-slate-500">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={load} disabled={isPending}>{isPending ? "Loading…" : "Apply"}</Button>
          <span className="text-sm text-slate-500 ml-2">{incidents.length} incidents</span>
        </div>
        <IncidentMap incidents={incidents} selectedId={selected} onSelect={setSelected} />
      </div>

      <aside className="space-y-4">
        {sel ? (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Incident {sel.id.slice(0, 8)}</p>
              <Badge variant={sel.status === "reported" ? "success" : sel.status === "canceled" ? "destructive" : "warning"}>{sel.status}</Badge>
            </div>
            <p className="text-sm text-slate-500">{formatDate(sel.occurred_at)}</p>
            <p className="text-xs text-slate-500 break-all">id: {sel.id}</p>
            <div className="flex gap-2">
              {sel.status === "received" ? (
                <Button onClick={() => setStatus(sel.id, "reported")} className="flex-1">Mark reported</Button>
              ) : (
                <Button onClick={() => setStatus(sel.id, "received")} variant="outline" className="flex-1">Reopen</Button>
              )}
              {sel.status !== "canceled" && (
                <Button onClick={() => setStatus(sel.id, "canceled")} variant="destructive" className="flex-1">Cancel</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">
            Click a marker to see details.
          </div>
        )}

        <div className="rounded-lg border bg-white">
          <ul className="divide-y max-h-[420px] overflow-auto">
            {incidents.map((i) => (
              <li
                key={i.id}
                className="p-3 cursor-pointer hover:bg-slate-50"
                onClick={() => setSelected(i.id)}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono">{i.id.slice(0, 8)}</span>
                  <Badge variant={i.status === "reported" ? "success" : i.status === "canceled" ? "destructive" : "warning"}>{i.status}</Badge>
                </div>
                <p className="text-xs text-slate-500">{formatDate(i.occurred_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
