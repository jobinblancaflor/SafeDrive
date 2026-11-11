"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PingMap } from "@/components/map/incident-map";
import type { LatLng } from "@/lib/incident-geo";
import { createClient } from "@/lib/supabase/client";
import { cn, formatDate } from "@/lib/utils";
import {
  PING_SELECT,
  PING_STATE_LABEL,
  PING_TIMEOUT_SECONDS,
  canRetry,
  pingState,
  type PingRow,
  type PingState,
} from "@/lib/ping-status";

// Reflects the current device/ping in the URL without a Next.js
// navigation (which would re-run the server component and refetch the
// device list on every ping) — purely so a reload or a shared link can
// restore this exact view.
function setUrlParams(params: { deviceId?: string; pingId?: string | null }) {
  const url = new URL(window.location.href);
  if (params.deviceId) url.searchParams.set("deviceId", params.deviceId);
  if (params.pingId) url.searchParams.set("pingId", params.pingId);
  else if (params.pingId === null) url.searchParams.delete("pingId");
  window.history.replaceState(null, "", url.toString());
}

// numeric columns can arrive as strings over Realtime; normalize once.
function toPingRow(raw: Record<string, unknown>): PingRow {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(raw.id),
    ping_date: String(raw.ping_date),
    status: raw.status === "received" ? "received" : "sent",
    lat: num(raw.lat),
    lng: num(raw.lng),
    accuracy: num(raw.accuracy),
    received_at: (raw.received_at as string | null) ?? null,
    located_at: (raw.located_at as string | null) ?? null,
    push_error: (raw.push_error as string | null) ?? null,
  };
}

const STATE_STYLE: Record<PingState, string> = {
  push_failed: "bg-red-50 text-status-critical border-red-200",
  waiting: "bg-slate-50 text-slate-700 border-slate-200",
  no_response: "bg-amber-50 text-amber-800 border-amber-200",
  received: "bg-sky-50 text-sky-800 border-sky-200",
  located: "bg-green-50 text-status-success border-green-200",
};

type Device = {
  id: string;
  device_uuid: string;
  ip: string | null;
  user: { fullname: string; phone: string | null } | null;
};

export function PingView({ devices }: { devices: Device[] }) {
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Device | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fallbackPoint, setFallbackPoint] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);
  const [standardPingAction, setStandardPingAction] = useState<"start" | "stop" | null>(null);
  const [current, setCurrent] = useState<PingRow | null>(null);
  const [recent, setRecent] = useState<PingRow[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const loadRecent = useCallback(async (deviceId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("pings")
      .select(PING_SELECT)
      .eq("device_id", deviceId)
      .order("ping_date", { ascending: false })
      .limit(5);
    setRecent((data ?? []).map((r) => toPingRow(r as Record<string, unknown>)));
  }, []);

  // Hydrate from ?deviceId=&pingId= on first load — reload-safe and
  // shareable: a link to an in-flight (or already-answered) ping restores
  // the same device selection, status, and location instead of starting blank.
  useEffect(() => {
    const deviceId = searchParams.get("deviceId");
    const pingId = searchParams.get("pingId");
    if (!deviceId) return;
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    if (pingId) {
      setSelected(device);
      void loadRecent(device.id);
      const supabase = createClient();
      supabase
        .from("pings")
        .select(PING_SELECT)
        .eq("id", pingId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setCurrent(toPingRow(data as Record<string, unknown>));
        });
    } else {
      void loadDeviceLocation(device);
    }
    // Read the URL once on mount only — subsequent updates are driven by
    // our own state, not by re-reading searchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-update status and map as the device answers the current ping
  // (PATCH /api/ping ack, POST /api/ping/location).
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ping-${currentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pings", filter: `id=eq.${currentId}` },
        (payload) => {
          const row = toPingRow(payload.new as Record<string, unknown>);
          setCurrent(row);
          setRecent((prev) => prev.map((p) => (p.id === row.id ? row : p)));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentId]);

  const currentState = current ? pingState(current, now) : null;

  // Tick while waiting so "no response" appears on time without a reload.
  useEffect(() => {
    if (currentState !== "waiting") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [currentState]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return devices;
    return devices.filter((d) =>
      [d.device_uuid, d.ip ?? "", d.user?.fullname ?? "", d.user?.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [q, devices]);

  async function loadDeviceLocation(d: Device) {
    setSelected(d);
    setMessage(null);
    setFallbackPoint(null);
    setCurrent(null);
    setRecent([]);
    setUrlParams({ deviceId: d.id, pingId: null });
    void loadRecent(d.id);
    // Use latest incident location as a stand-in for current device
    // location until a fresh ping's own location comes in.
    // incidents.device_id stores devices.device_uuid (text), not devices.id.
    const supabase = createClient();
    const { data } = await supabase
      .from("incidents")
      .select("lat, lng")
      .eq("device_id", d.device_uuid)
      .not("lat", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.lat !== null && data.lng !== null) {
      setFallbackPoint({ lat: Number(data.lat), lng: Number(data.lng) });
    }
  }

  async function sendPing() {
    if (!selected) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: selected.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: Record<string, unknown> };
    setLoading(false);
    if (!res.ok || !json.data) {
      setMessage("Failed to send ping.");
      return;
    }
    const row = toPingRow(json.data);
    setNow(Date.now());
    setCurrent(row);
    setRecent((prev) => [row, ...prev.filter((p) => p.id !== row.id)].slice(0, 5));
    setUrlParams({ deviceId: selected.id, pingId: row.id });
  }

  function showPing(p: PingRow) {
    if (!selected) return;
    setNow(Date.now());
    setCurrent(p);
    setUrlParams({ deviceId: selected.id, pingId: p.id });
  }

  async function toggleStandardPings(action: "start" | "stop") {
    if (!selected) return;
    setStandardPingAction(action);
    setMessage(null);
    const res = await fetch(`/api/ping/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: selected.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setStandardPingAction(null);
    if (!res.ok) setMessage(json.error ?? `Failed to ${action} standard pings.`);
    else setMessage(action === "start" ? "Standard pings started." : "Standard pings stopped.");
  }

  const pingPoint: LatLng | null =
    current && current.lat !== null && current.lng !== null
      ? { lat: current.lat, lng: current.lng }
      : null;
  const point = pingPoint ?? fallbackPoint;
  const accuracy = pingPoint ? current?.accuracy ?? null : null;
  const elapsed = current ? Math.max(0, Math.round((now - Date.parse(current.ping_date)) / 1000)) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
      <div className="space-y-3">
        <Input placeholder="Search by uuid, ip, name, or phone" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="rounded-lg border bg-white divide-y max-h-[500px] overflow-auto">
          {filtered.map((d) => (
            <li
              key={d.id}
              className={`p-3 cursor-pointer hover:bg-slate-50 ${selected?.id === d.id ? "bg-slate-50" : ""}`}
              onClick={() => loadDeviceLocation(d)}
            >
              <p className="font-mono text-sm">{d.device_uuid}</p>
              <p className="text-xs text-slate-500">{d.user?.fullname ?? "—"} · {d.ip ?? "—"}</p>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="p-3 text-sm text-slate-500 text-center">No devices match.</li>
          )}
        </ul>
      </div>
      <div className="space-y-4">
        {selected ? (
          <>
            <div className="rounded-lg border bg-white p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm truncate">{selected.device_uuid}</p>
                <p className="text-xs text-slate-500">
                  {selected.user?.fullname ?? "—"} · {selected.ip ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={sendPing} disabled={loading}>{loading ? "Sending…" : "Ping"}</Button>
                <Button
                  variant="outline"
                  onClick={() => toggleStandardPings("start")}
                  disabled={standardPingAction !== null}
                >
                  {standardPingAction === "start" ? "Starting…" : "Start pings"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toggleStandardPings("stop")}
                  disabled={standardPingAction !== null}
                >
                  {standardPingAction === "stop" ? "Stopping…" : "Stop pings"}
                </Button>
              </div>
            </div>

            {current && currentState && (
              <div
                className={cn(
                  "rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3",
                  STATE_STYLE[currentState],
                )}
                role="status"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {currentState === "waiting" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                    {PING_STATE_LABEL[currentState]}
                  </p>
                  <p className="text-xs opacity-80">
                    {currentState === "waiting"
                      ? `Sent ${elapsed}s ago — gives up after ${PING_TIMEOUT_SECONDS}s`
                      : currentState === "no_response"
                        ? `No answer within ${PING_TIMEOUT_SECONDS}s. The device may be offline or the app closed.`
                        : currentState === "push_failed"
                          ? current.push_error
                          : currentState === "located" && current.located_at
                            ? `Location reported ${formatDate(current.located_at)}`
                            : current.received_at
                              ? `Answered ${formatDate(current.received_at)}`
                              : `Sent ${formatDate(current.ping_date)}`}
                  </p>
                </div>
                {canRetry(currentState) && (
                  <Button size="sm" variant="outline" onClick={sendPing} disabled={loading}>
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Retry
                  </Button>
                )}
              </div>
            )}

            {message && <p className="text-sm text-slate-600">{message}</p>}
            <PingMap point={point} accuracyMeters={accuracy} />
            {!pingPoint && fallbackPoint ? (
              <p className="text-xs text-slate-500">Map shows this device&apos;s last incident location.</p>
            ) : !point ? (
              <p className="text-xs text-slate-500">No recent location — map shows default center.</p>
            ) : null}
            {pingPoint && accuracy != null && (
              <p className="text-xs text-slate-500">Accuracy: ±{Math.round(accuracy)} m</p>
            )}

            {recent.length > 0 && (
              <div className="rounded-lg border bg-white">
                <p className="border-b px-4 py-2 text-sm font-semibold">Recent pings</p>
                <ul className="divide-y">
                  {recent.map((p) => {
                    const s = pingState(p, now);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => showPing(p)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50",
                            current?.id === p.id && "bg-slate-50",
                          )}
                        >
                          <span className="text-xs text-slate-600">{formatDate(p.ping_date)}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATE_STYLE[s])}>
                            {PING_STATE_LABEL[s]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border bg-white p-8 text-sm text-slate-500">
            Pick a device to load its last known location and send a ping.
          </div>
        )}
      </div>
    </div>
  );
}
