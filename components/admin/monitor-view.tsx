"use client";

import { useEffect, useState, useTransition } from "react";
import { IncidentMap, type MapIncident } from "@/components/map/incident-map";
import { IncidentMessages, type IncidentMessage } from "@/components/admin/incident-messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export function MonitorView({
  initialIncidents,
  initialDate,
  currentUserId,
}: {
  initialIncidents: MapIncident[];
  initialDate: string;
  currentUserId: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [incidents, setIncidents] = useState<MapIncident[]>(initialIncidents);
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<IncidentMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setMessagesLoading(true);
    const supabase = createClient();
    supabase
      .from("incident_messages")
      .select("id, incident_id, sender_id, body, created_at")
      .eq("incident_id", selected)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (cancelled) return;
        setMessages(data ?? []);
        setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

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
    <div className="grid h-full min-h-0 grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs uppercase text-slate-500">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={load} disabled={isPending}>{isPending ? "Loading…" : "Apply"}</Button>
          <span className="text-sm text-slate-500 ml-2">{incidents.length} incidents</span>
        </div>
        <IncidentMap
          incidents={incidents}
          selectedId={selected}
          onSelect={setSelected}
          className="h-full flex-1"
        />
      </div>

      <aside className="flex h-full min-h-0 flex-col gap-4">
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
          <ul className="divide-y max-h-[200px] overflow-auto">
            {incidents.map((i) => (
              <li
                key={i.id}
                className={cn(
                  "p-3 cursor-pointer hover:bg-slate-50",
                  i.id === selected && "bg-slate-100",
                )}
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

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-white">
          {sel ? (
            messagesLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Loading messages…
              </div>
            ) : (
              <IncidentMessages
                key={sel.id}
                incidentId={sel.id}
                currentUserId={currentUserId}
                initialMessages={messages}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
              Select an incident to message the rider.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
