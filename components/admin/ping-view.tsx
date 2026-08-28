"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PingMap } from "@/components/map/incident-map";
import type { LatLng } from "@/lib/incident-geo";
import { createClient } from "@/lib/supabase/client";

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
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [standardPingAction, setStandardPingAction] = useState<"start" | "stop" | null>(null);
  const [pendingPingId, setPendingPingId] = useState<string | null>(null);

  // Hydrate from ?deviceId=&pingId= on first load — reload-safe and
  // shareable: a link to an in-flight (or already-answered) ping restores
  // the same device selection and location instead of starting blank.
  useEffect(() => {
    const deviceId = searchParams.get("deviceId");
    const pingId = searchParams.get("pingId");
    if (!deviceId) return;
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;

    if (pingId) {
      // Skip the incidents-fallback path entirely here — we're about to
      // fetch this ping's own (more current) location directly, and doing
      // both risks the fallback's response landing second and clobbering it.
      setSelected(device);
      setPendingPingId(pingId);
      const supabase = createClient();
      supabase
        .from("pings")
        .select("lat, lng, accuracy")
        .eq("id", pingId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.lat != null && data?.lng != null) {
            setPoint({ lat: data.lat, lng: data.lng });
            setAccuracy(data.accuracy);
          }
        });
    } else {
      void loadDeviceLocation(device);
    }
    // Read the URL once on mount only — subsequent updates are driven by
    // our own state, not by re-reading searchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-update the map when the device reports its location for the ping
  // we just sent (POST /api/ping/location, updates pings.lat/lng/accuracy).
  useEffect(() => {
    if (!pendingPingId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`ping-location-${pendingPingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pings", filter: `id=eq.${pendingPingId}` },
        (payload) => {
          const row = payload.new as { lat: number | null; lng: number | null; accuracy: number | null };
          if (row.lat !== null && row.lng !== null) {
            setPoint({ lat: row.lat, lng: row.lng });
            setAccuracy(row.accuracy);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pendingPingId]);

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
    setPingResult(null);
    setPoint(null);
    setAccuracy(null);
    setPendingPingId(null);
    setUrlParams({ deviceId: d.id, pingId: null });
    // Use latest incident location as a stand-in for current device location
    // until a fresh ping's own location comes in.
    const supabase = createClient();
    const { data } = await supabase
      .from("incidents")
      .select("lat, lng")
      .eq("device_id", d.id)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.lat !== null && data.lng !== null) setPoint({ lat: data.lat, lng: data.lng });
  }

  async function sendPing() {
    if (!selected) return;
    setLoading(true);
    setPingResult(null);
    setAccuracy(null);
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: selected.id }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string };
      pushed?: boolean;
      pushError?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setPingResult("Failed to send ping.");
      return;
    }
    if (json.data?.id) {
      setPendingPingId(json.data.id);
      setUrlParams({ deviceId: selected.id, pingId: json.data.id });
    }
    if (json.pushed) setPingResult("Ping sent — awaiting device receipt.");
    else setPingResult(`Ping recorded, but push wasn't delivered: ${json.pushError ?? "unknown error"}`);
  }

  async function toggleStandardPings(action: "start" | "stop") {
    if (!selected) return;
    setStandardPingAction(action);
    setPingResult(null);
    const res = await fetch(`/api/ping/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: selected.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setStandardPingAction(null);
    if (!res.ok) setPingResult(json.error ?? `Failed to ${action} standard pings.`);
    else setPingResult(action === "start" ? "Standard pings started." : "Standard pings stopped.");
  }

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
            <div className="rounded-lg border bg-white p-4 flex items-center justify-between">
              <div>
                <p className="font-mono text-sm">{selected.device_uuid}</p>
                <p className="text-xs text-slate-500">
                  {selected.user?.fullname ?? "—"} · {selected.ip ?? "—"}
                </p>
              </div>
              <div className="flex gap-2">
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
            {pingResult && <p className="text-sm text-slate-600">{pingResult}</p>}
            <PingMap point={point} accuracyMeters={accuracy} />
            {!point && pendingPingId ? (
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Waiting for the device to report its location…
              </p>
            ) : !point ? (
              <p className="text-xs text-slate-500">No recent location — map shows default center.</p>
            ) : null}
            {point && accuracy != null && (
              <p className="text-xs text-slate-500">Accuracy: ±{Math.round(accuracy)} m</p>
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
