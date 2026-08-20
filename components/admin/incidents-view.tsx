"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, LayoutGrid, Loader2, Map as MapIcon, Table2, Phone, MapPin, ExternalLink, StopCircle } from "lucide-react";
import { IncidentMap, type MapIncident } from "@/components/map/incident-map";
import { IncidentsTable, type IncidentRow } from "@/components/admin/incidents-table";
import { IncidentTypeBadge } from "@/components/admin/incident-type-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { reverseGeocode } from "@/lib/reverse-geocode";
import type { LatLng as IncidentLatLng } from "@/lib/incident-geo";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { IncidentType } from "@/lib/incident-type";

export type EmergencyContact = {
  id: string;
  fullname: string;
  phone: string;
};

export type ViewIncident = {
  id: string;
  occurred_at: string;
  created_at: string;
  status: "received" | "reported" | "canceled";
  read: boolean;
  incident_type: IncidentType | null;
  lat: number | null;
  lng: number | null;
  user_id: string | null;
  device_id: string | null;
  user_name: string | null;
  user_phone: string | null;
  user_profile_img: string | null;
  device_uuid: string | null;
};

type RealtimeIncidentRow = {
  id: string;
  occurred_at: string;
  created_at?: string;
  status: "received" | "reported" | "canceled";
  read: boolean;
  incident_type: IncidentType | null;
  lat: number | null;
  lng: number | null;
  user_id: string | null;
  device_id: string | null;
};

type DateScope = "today" | "all" | "custom";
type LatLng = { lat: number; lng: number };

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDistanceMeters(p1: LatLng, p2: LatLng): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = (p1.lat * Math.PI) / 180;
  const phi2 = (p2.lat * Math.PI) / 180;
  const deltaPhi = ((p2.lat - p1.lat) * Math.PI) / 180;
  const deltaLambda = ((p2.lng - p1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function matchesSearch(incident: ViewIncident, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [incident.id, incident.user_name ?? "", incident.user_phone ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function compareIncidents(
  a: ViewIncident,
  b: ViewIncident,
  sortBy: "created_at" | "occurred_at",
  order: "asc" | "desc",
): number {
  const comparison = a[sortBy].localeCompare(b[sortBy]);
  return order === "asc" ? comparison : -comparison;
}

export function IncidentsView({
  contactsByUserId,
  filterStatus = null,
  filterQuery = "",
  filterType = null,
  defaultDate,
}: {
  contactsByUserId: Record<string, EmergencyContact[]>;
  filterStatus?: "received" | "reported" | "canceled" | null;
  filterQuery?: string;
  filterType?: IncidentType | null;
  defaultDate?: string;
}) {
  const [view, setView] = useState<"map" | "table">("map");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stopPending, setStopPending] = useState(false);
  const [stopResult, setStopResult] = useState<null | "ok" | { error: string }>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);
  const [incidents, setIncidents] = useState<ViewIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [scope, setScope] = useState<DateScope>("today");
  const [date, setDate] = useState<string>(defaultDate ?? todayUtcDate());

  // Advanced Filters & Search
  const [search, setSearch] = useState(filterQuery);
  const [status, setStatus] = useState<string>(filterStatus ?? "all");
  const [type, setType] = useState<string>(filterType ?? "all");
  const [sortBy, setSortBy] = useState<"created_at" | "occurred_at">("created_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Geographic Filter State (defaults to 50km radius)
  const [filterByLocation, setFilterByLocation] = useState(false);
  const [filterCenter, setFilterCenter] = useState<LatLng | null>({ lat: 14.5995, lng: 120.9842 }); // Manila default
  const [radius, setRadius] = useState<number>(50); // in kilometers

  // Fetch rows whenever the filters or date scope changes.
  const reload = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      if (scope === "today" || scope === "custom") {
        params.set("date", date);
      }
      if (status !== "all") params.set("status", status);
      if (type !== "all") params.set("type", type);
      if (search.trim()) params.set("q", search.trim());
      params.set("sortBy", sortBy);
      params.set("order", order);
      if (filterByLocation && filterCenter) {
        params.set("lat", filterCenter.lat.toString());
        params.set("lng", filterCenter.lng.toString());
        params.set("radius", (radius * 1000).toString());
      }

      const res = await fetch(`/api/incidents?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        incidents?: ViewIncident[];
        error?: string;
      };
      if (!res.ok) {
        setFetchError(json.error ?? "Failed to load incidents");
        setIncidents([]);
        return;
      }
      setIncidents(json.incidents ?? []);
    } catch (err) {
      console.error(err);
      setFetchError("Network error");
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [scope, date, status, type, search, sortBy, order, filterByLocation, filterCenter, radius]);

  useEffect(() => {
    // Add simple debounce for search text
    const timer = setTimeout(() => {
      void reload();
    }, 300);
    return () => clearTimeout(timer);
  }, [reload]);

  // Subscribe to realtime changes on the incidents table. Realtime events are
  // merged into local state — the API fetch above provides the initial slice
  // for the chosen date.
  useEffect(() => {
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel("incidents-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string })?.id;
            if (!oldId) return;
            setIncidents((prev) => prev.filter((i) => i.id !== oldId));
            setSelectedId((cur) => (cur === oldId ? null : cur));
            return;
          }

          const row = payload.new as RealtimeIncidentRow | null;
          if (!row?.id) return;

          (async () => {
            const { data, error } = await supabase
              .from("incidents")
              .select(
                "id, occurred_at, created_at, status, read, incident_type, lat, lng, user_id, device_id, profiles!incidents_user_id_fkey(fullname, phone, profile_img)",
              )
              .eq("id", row.id)
              .maybeSingle();
            if (error || !data) return;
            const r = data as unknown as {
              id: string;
              occurred_at: string;
              created_at: string;
              status: "received" | "reported" | "canceled";
              read: boolean;
              incident_type: IncidentType | null;
              lat: number | null;
              lng: number | null;
              user_id: string | null;
              device_id: string | null;
              profiles: { fullname: string; phone: string | null; profile_img: string | null } | null;
            };
            let deviceUuid: string | null = null;
            if (r.device_id) {
              const { data: device } = await supabase
                .from("devices")
                .select("device_uuid")
                .eq("id", r.device_id)
                .maybeSingle();
              deviceUuid = device?.device_uuid ?? null;
            }
            const next: ViewIncident = {
              id: r.id,
              occurred_at: r.occurred_at,
              created_at: r.created_at,
              status: r.status,
              read: r.read,
              incident_type: r.incident_type ?? null,
              lat: r.lat,
              lng: r.lng,
              user_id: r.user_id,
              device_id: r.device_id,
              user_name: r.profiles?.fullname ?? null,
              user_phone: r.profiles?.phone ?? null,
              user_profile_img: r.profiles?.profile_img ?? null,
              device_uuid: deviceUuid,
            };

            // Only merge if the row fits active filter constraints (date, status, type, search, radius)
            const matchesDate = isInScope(next.created_at, scope, date);
            const matchesStatus = status === "all" || next.status === status;
            const matchesType = type === "all" || next.incident_type === type;
            let matchesLocation = true;
            if (filterByLocation && filterCenter) {
              const pt: IncidentLatLng | null = next.lat !== null && next.lng !== null
                ? { lat: next.lat, lng: next.lng }
                : null;
              if (pt) {
                const dist = getDistanceMeters(pt, filterCenter);
                matchesLocation = dist <= radius * 1000;
              } else {
                matchesLocation = false;
              }
            }
            const inScope =
              matchesDate &&
              matchesStatus &&
              matchesType &&
              matchesLocation &&
              matchesSearch(next, search);

            setIncidents((prev) => {
              const idx = prev.findIndex((i) => i.id === next.id);
              if (idx === -1) {
                if (!inScope) return prev;
                return [...prev, next].sort((a, b) => compareIncidents(a, b, sortBy, order));
              }
              if (!inScope) {
                return prev.filter((i) => i.id !== next.id);
              }
              const copy = prev.slice();
              copy[idx] = next;
              return copy.sort((a, b) => compareIncidents(a, b, sortBy, order));
            });
          })();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scope, date, status, type, search, sortBy, order, filterByLocation, filterCenter, radius]);

  const mapIncidents: MapIncident[] = useMemo(
    () =>
      incidents.map((i) => ({
        id: i.id,
        status: i.status,
        read: i.read,
        occurred_at: i.occurred_at,
        incident_type: i.incident_type,
        user_name: i.user_name,
        user_phone: i.user_phone,
        lat: i.lat,
        lng: i.lng,
      })),
    [incidents],
  );

  const tableIncidents: IncidentRow[] = useMemo(
    () =>
      incidents.map((i) => ({
        id: i.id,
        occurred_at: i.occurred_at,
        status: i.status,
        read: i.read,
        incident_type: i.incident_type,
        user_name: i.user_name,
      })),
    [incidents],
  );

  const selected = selectedId ? incidents.find((i) => i.id === selectedId) ?? null : null;

  useEffect(() => {
    setStopResult(null);
    setAddress(null);
    if (!selected) {
      setAddressLoading(false);
      return;
    }
    const pt: IncidentLatLng | null = selected.lat !== null && selected.lng !== null
      ? { lat: selected.lat, lng: selected.lng }
      : null;
    if (!pt) {
      setAddressLoading(false);
      return;
    }
    let cancelled = false;
    setAddressLoading(true);
    reverseGeocode(pt.lat, pt.lng).then((a) => {
      if (cancelled) return;
      setAddress(a);
      setAddressLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function onStop() {
    if (!selected) return;
    setStopPending(true);
    setStopResult(null);
    try {
      const res = await fetch(`/api/incidents/${selected.id}/stop`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) setStopResult({ error: json.error ?? "Push failed" });
      else setStopResult("ok");
    } catch {
      setStopResult({ error: "Network error" });
    } finally {
      setStopPending(false);
    }
  }

  const [statusPending, setStatusPending] = useState(false);

  async function onStatusChange(nextStatus: "received" | "reported" | "canceled") {
    if (!selected) return;
    setStatusPending(true);
    try {
      const res = await fetch(`/api/incident/${selected.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setIncidents((prev) =>
          prev.map((i) => (i.id === selected.id ? { ...i, status: nextStatus, read: true } : i)),
        );
      }
    } finally {
      setStatusPending(false);
    }
  }

  const scopeLabel =
    scope === "all" ? "All time" : scope === "today" ? "Today" : date;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4 space-y-4">
        {/* Date Scope Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-slate-700">Date Range:</span>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 text-sm">
              <ScopeBtn active={scope === "today"} onClick={() => { setScope("today"); setDate(todayUtcDate()); }}>
                Today
              </ScopeBtn>
              <ScopeBtn active={scope === "custom"} onClick={() => setScope("custom")}>
                Custom date
              </ScopeBtn>
              <ScopeBtn active={scope === "all"} onClick={() => setScope("all")}>
                All time
              </ScopeBtn>
            </div>
            {scope === "custom" && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" aria-hidden />
                <Input
                  type="date"
                  value={date}
                  max={todayUtcDate()}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 w-[180px]"
                />
              </div>
            )}
          </div>
          {fetchError && (
            <p className="text-sm text-status-critical">{fetchError}</p>
          )}
        </div>

        {/* Text Search & Enum Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Search</label>
            <Input
              type="text"
              placeholder="Search ID, name, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All Statuses</option>
              <option value="received">Received</option>
              <option value="reported">Reported</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Incident Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="all">All Types</option>
              <option value="SOS Button">SOS Button</option>
              <option value="SOS Volume keys">SOS Volume Keys</option>
              <option value="SOS USB">SOS USB</option>
              <option value="SOS Fall Detected">SOS Fall Detected</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500">Sort By</label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "created_at" | "occurred_at")}
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="created_at">Created At</option>
              </select>
              <select
                value={order}
                onChange={(e) => setOrder(e.target.value as "asc" | "desc")}
                className="flex h-10 w-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>
          </div>
        </div>

        {/* Location Radius Filter */}
        <div className="bg-slate-50 -mx-4 -mb-4 p-4 rounded-b-lg border-t space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700 text-sm">
              <input
                type="checkbox"
                checked={filterByLocation}
                onChange={(e) => setFilterByLocation(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              Filter by Location (Radius)
            </label>

            {filterByLocation && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-500">Radius:</span>
                <select
                  value={radius}
                  onChange={(e) => {
                    setRadius(Number(e.target.value));
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setFilterCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => {
                          // Location unavailable/denied — leave the existing center as-is.
                        },
                      );
                    }
                  }}
                  className="flex h-9 w-28 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:outline-none"
                >
                  <option value={1}>1 km</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={50}>50 km</option>
                </select>
                {filterCenter && (
                  <span className="text-slate-500 font-mono text-xs">
                    Center: {filterCenter.lat.toFixed(4)}, {filterCenter.lng.toFixed(4)}
                  </span>
                )}
              </div>
            )}
          </div>
          {filterByLocation && (
            <p className="text-xs text-slate-500">
              💡 Click anywhere on the map to set a new filter center coordinates.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {loading ? "Loading…" : `${incidents.length} incidents`}
          <span className="ml-2 text-slate-400">· {scopeLabel}</span>
        </p>
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 text-sm">
          <ToggleBtn active={view === "map"} onClick={() => setView("map")}>
            <MapIcon className="h-4 w-4" aria-hidden /> Map
          </ToggleBtn>
          <ToggleBtn active={view === "table"} onClick={() => setView("table")}>
            <Table2 className="h-4 w-4" aria-hidden /> Table
          </ToggleBtn>
        </div>
      </div>

      {loading && incidents.length === 0 ? (
        <div className="flex h-[520px] items-center justify-center rounded-lg border bg-white text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading incidents…
        </div>
      ) : view === "map" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <div className="relative h-[520px] overflow-hidden rounded-lg border">
            <IncidentMap
              incidents={mapIncidents}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filterCenter={filterByLocation ? filterCenter : null}
              onMapClick={(pt) => {
                if (filterByLocation) {
                  setFilterCenter(pt);
                }
              }}
            />
          </div>
          <IncidentDetailPanel
            selected={selected}
            address={address}
            addressLoading={addressLoading}
            contacts={selected?.user_id ? contactsByUserId[selected.user_id] : []}
            stopPending={stopPending}
            stopResult={stopResult}
            onStop={onStop}
            statusPending={statusPending}
            onStatusChange={onStatusChange}
            onClose={() => setSelectedId(null)}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          <IncidentsTable
            incidents={tableIncidents}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <IncidentDetailPanel
            selected={selected}
            address={address}
            addressLoading={addressLoading}
            contacts={selected?.user_id ? contactsByUserId[selected.user_id] : []}
            stopPending={stopPending}
            stopResult={stopResult}
            onStop={onStop}
            statusPending={statusPending}
            onStatusChange={onStatusChange}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  );
}

function isInScope(createdAt: string, scope: DateScope, date: string): boolean {
  if (scope === "all") return true;
  const rowDay = createdAt.slice(0, 10);
  if (scope === "today") return rowDay === todayUtcDate();
  return rowDay === date;
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded px-3 transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

function ScopeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded px-3 transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

function IncidentDetailPanel({
  selected,
  address,
  addressLoading,
  contacts,
  stopPending,
  stopResult,
  onStop,
  statusPending,
  onStatusChange,
  onClose,
}: {
  selected: ViewIncident | null;
  address: string | null;
  addressLoading: boolean;
  contacts: EmergencyContact[];
  stopPending: boolean;
  stopResult: null | "ok" | { error: string };
  onStop: () => void;
  statusPending: boolean;
  onStatusChange: (status: "received" | "reported" | "canceled") => void;
  onClose: () => void;
}) {
  if (!selected) {
    return (
      <aside className="rounded-lg border bg-white p-4 text-sm text-slate-500">
        <LayoutGrid className="mb-2 h-4 w-4 text-slate-400" aria-hidden />
        Click a marker on the map to see incident details.
      </aside>
    );
  }

  const coords = selected.lat !== null && selected.lng !== null
    ? { lat: selected.lat, lng: selected.lng }
    : { lat: null, lng: null };
  const fullname = selected.user_name ?? "Unknown user";
  const phone = selected.user_phone;
  const noDevice = !selected.device_id;

  return (
    <aside className="flex flex-col gap-4 rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase text-slate-500">Incident</p>
          <p className="font-mono text-sm">{selected.id.slice(0, 8)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={selected.status === "reported" ? "success" : selected.status === "canceled" ? "destructive" : "warning"}>
            {selected.status}
          </Badge>
          <IncidentTypeBadge type={selected.incident_type} size="sm" />
        </div>
      </div>

      <div className="flex items-start gap-3">
        <Avatar src={selected.user_profile_img} alt={fullname} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{fullname}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
            <Phone className="h-3.5 w-3.5" aria-hidden />
            {phone ?? "—"}
          </p>
        </div>
      </div>

      <div className="space-y-1 text-xs text-slate-600">
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 flex-none" aria-hidden />
          <span className="min-w-0">
            {addressLoading ? (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Looking up address…
              </span>
            ) : address ? (
              <span>{address}</span>
            ) : coords.lat !== null && coords.lng !== null ? (
              <span className="font-mono">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </span>
            ) : (
              <span className="text-slate-500">No location</span>
            )}
          </span>
        </p>
        <p className="text-slate-500">{formatDate(selected.occurred_at)}</p>
      </div>

      <div>
        <p className="text-xs uppercase text-slate-500 mb-2">
          Emergency contacts ({contacts.length})
        </p>
        {contacts.length === 0 ? (
          <p className="text-xs text-slate-500">No contacts on file.</p>
        ) : (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="rounded border bg-slate-50 px-3 py-2 text-xs">
                <p className="font-medium text-slate-800">{c.fullname}</p>
                <p className="text-slate-600">{c.phone}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <div className="flex gap-2">
          {selected.status === "received" ? (
            <Button
              className="flex-1"
              size="sm"
              onClick={() => onStatusChange("reported")}
              disabled={statusPending}
            >
              Mark reported
            </Button>
          ) : (
            <Button
              variant="outline"
              className="flex-1"
              size="sm"
              onClick={() => onStatusChange("received")}
              disabled={statusPending}
            >
              Reopen
            </Button>
          )}
          {selected.status !== "canceled" && (
            <Button
              variant="destructive"
              className="flex-1"
              size="sm"
              onClick={() => onStatusChange("canceled")}
              disabled={statusPending}
            >
              Cancel
            </Button>
          )}
        </div>
        <Link
          href={`/monitor/${selected.id}`}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium hover:bg-slate-100"
        >
          <ExternalLink className="h-4 w-4" aria-hidden /> Monitor
        </Link>
        <Button
          variant="destructive"
          className="w-full"
          onClick={onStop}
          disabled={stopPending || noDevice}
        >
          <StopCircle className="h-4 w-4" aria-hidden />
          {stopPending ? "Sending…" : "STOP"}
        </Button>
        {noDevice && (
          <p className="text-xs text-slate-500">No device linked.</p>
        )}
        {stopResult === "ok" && (
          <p className="text-xs text-status-success">Push sent.</p>
        )}
        {stopResult !== null && stopResult !== "ok" && (
          <p className="text-xs text-status-critical">{stopResult.error}</p>
        )}
        <Button variant="ghost" size="sm" onClick={onClose} className="self-end">
          Close
        </Button>
      </div>
    </aside>
  );
}
