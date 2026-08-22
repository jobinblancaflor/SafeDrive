"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PingMap } from "@/components/map/incident-map";
import type { LatLng } from "@/lib/incident-geo";
import { createClient } from "@/lib/supabase/client";

type Device = {
  id: string;
  device_uuid: string;
  ip: string | null;
  user: { fullname: string; phone: string | null } | null;
};

export function PingView({ devices }: { devices: Device[] }) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Device | null>(null);
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [point, setPoint] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(false);

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
    // Use latest incident location as a stand-in for current device location.
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
    const res = await fetch("/api/ping", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_id: selected.id }),
    });
    const json = (await res.json().catch(() => ({}))) as { pushed?: boolean; pushError?: string };
    setLoading(false);
    if (!res.ok) setPingResult("Failed to send ping.");
    else if (json.pushed) setPingResult("Ping sent — awaiting device receipt.");
    else setPingResult(`Ping recorded, but push wasn't delivered: ${json.pushError ?? "unknown error"}`);
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
              <Button onClick={sendPing} disabled={loading}>{loading ? "Sending…" : "Ping"}</Button>
            </div>
            {pingResult && <p className="text-sm text-slate-600">{pingResult}</p>}
            <PingMap point={point} />
            {!point && <p className="text-xs text-slate-500">No recent location — map shows default center.</p>}
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
