"use client";

import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { LatLng } from "@/lib/incident-geo";
import { incidentTypeMeta, type IncidentType } from "@/lib/incident-type";

export type MapIncident = {
  id: string;
  status: "received" | "reported" | "canceled";
  read: boolean;
  occurred_at: string;
  incident_type?: IncidentType | null;
  user_name?: string | null;
  user_phone?: string | null;
  lat: number | null;
  lng: number | null;
};

const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 };
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function pinIcon(color: string): L.DivIcon {
  const svg = `
    <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="#ffffff"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const CTA_BUTTON_STYLE =
  "display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 10px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;border:1px solid #cbd5e1;cursor:pointer;";

function popupContent(p: MapIncident): string {
  const meta = incidentTypeMeta(p.incident_type ?? null);
  const typeLine = meta
    ? `<div style="color:${meta.hex};font-weight:600">${meta.emoji} ${meta.label}</div>`
    : "";
  const nameLine = p.user_name
    ? `<div>${escapeHtml(p.user_name)}</div>`
    : "";
  const phoneLine = p.user_phone
    ? `<div>${escapeHtml(p.user_phone)}</div>`
    : "";
  const callButton =
    p.user_phone && isMobileDevice()
      ? `<a href="tel:${escapeHtml(p.user_phone)}" style="${CTA_BUTTON_STYLE}background:#ffffff;color:#0f172a;">Call</a>`
      : "";
  return `
    <div data-incident-id="${p.id}" style="font-size:0.875rem">
      <div style="font-weight:600">Incident ${p.id.slice(0, 8)}</div>
      <div>Status: ${p.status}</div>
      ${typeLine}
      ${nameLine}
      ${phoneLine}
      <div>${new Date(p.occurred_at).toLocaleString()}</div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <a href="/monitor/${p.id}" target="_blank" rel="noopener noreferrer" style="${CTA_BUTTON_STYLE}background:#0f172a;color:#ffffff;">Monitor</a>
        <button type="button" class="ss-popup-stop" style="${CTA_BUTTON_STYLE}background:#dc2626;color:#ffffff;border-color:#dc2626;">Stop</button>
        ${callButton}
      </div>
      <div class="ss-popup-result" style="margin-top:4px;font-size:11px"></div>
    </div>`;
}

function ClusteredMarkers({
  points,
  selectedId,
  onSelect,
}: {
  points: (MapIncident & LatLng)[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const cluster = L.markerClusterGroup();
    clusterRef.current = cluster;
    const markers = markersRef.current;
    markers.clear();

    for (const p of points) {
      const meta = incidentTypeMeta(p.incident_type ?? null);
      const color =
        meta?.hex ?? (p.status === "reported" ? "#16a34a" : p.status === "canceled" ? "#ef4444" : "#d97706");
      const marker = L.marker([p.lat, p.lng], { icon: pinIcon(color) });
      marker.bindPopup(popupContent(p));
      marker.on("click", () => onSelect?.(p.id));
      marker.on("popupclose", () => {
        if (selectedIdRef.current === p.id) onSelect?.(null);
      });
      markers.set(p.id, marker);
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
      clusterRef.current = null;
      markers.clear();
    };
  }, [map, points, onSelect]);

  useEffect(() => {
    if (!selectedId) {
      map.closePopup();
      return;
    }
    markersRef.current.get(selectedId)?.openPopup();
  }, [map, selectedId, points]);

  // Popup content is regenerated (fresh DOM) on every openPopup() call, and a
  // marker's own click-to-open plus our selectedId-sync effect both call
  // openPopup() per click — so a button reference wired via a 'popupopen'
  // listener can point at an already-replaced node. Event delegation on the
  // map container sidesteps that: it reads the incident id from the DOM at
  // click time instead of caching a node reference.
  useEffect(() => {
    const container = map.getContainer();

    async function onContainerClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement;
      const stopBtn = target.closest<HTMLButtonElement>(".ss-popup-stop");
      if (!stopBtn) return;
      const incidentId = stopBtn.closest<HTMLElement>("[data-incident-id]")?.dataset.incidentId;
      const resultEl = stopBtn.parentElement?.parentElement?.querySelector<HTMLElement>(".ss-popup-result");
      if (!incidentId || stopBtn.disabled) return;

      stopBtn.disabled = true;
      stopBtn.textContent = "Sending…";
      if (resultEl) resultEl.textContent = "";
      try {
        const res = await fetch(`/api/incidents/${incidentId}/stop`, { method: "POST" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          if (resultEl) {
            resultEl.textContent = "Push sent.";
            resultEl.style.color = "#16a34a";
          }
        } else {
          if (resultEl) {
            resultEl.textContent = json.error ?? "Push failed";
            resultEl.style.color = "#dc2626";
          }
          stopBtn.disabled = false;
          stopBtn.textContent = "Stop";
        }
      } catch {
        if (resultEl) {
          resultEl.textContent = "Network error";
          resultEl.style.color = "#dc2626";
        }
        stopBtn.disabled = false;
        stopBtn.textContent = "Stop";
      }
    }

    container.addEventListener("click", onContainerClick);
    return () => {
      container.removeEventListener("click", onContainerClick);
    };
  }, [map]);

  return null;
}

function FilterCenterMarker({ point }: { point: LatLng | null }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    const icon = L.divIcon({
      html: `
        <div class="relative flex h-8 w-8 items-center justify-center">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
          <span class="relative inline-flex h-4 w-4 rounded-full bg-blue-600 border-2 border-white shadow-md"></span>
        </div>`,
      className: "",
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    const marker = L.marker([point.lat, point.lng], { icon, interactive: false }).addTo(map);
    map.flyTo([point.lat, point.lng], map.getZoom());
    return () => {
      map.removeLayer(marker);
    };
  }, [map, point]);

  return null;
}

function ClickHandler({ onMapClick }: { onMapClick?: (point: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function IncidentMapImpl({
  incidents,
  selectedId,
  onSelect,
  filterCenter,
  onMapClick,
}: {
  incidents: MapIncident[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  filterCenter?: LatLng | null;
  onMapClick?: (point: LatLng) => void;
}) {
  const points = useMemo(
    () =>
      incidents
        .map((i) => (i.lat !== null && i.lng !== null ? { ...i, lat: i.lat, lng: i.lng } : null))
        .filter(Boolean) as (MapIncident & LatLng)[],
    [incidents],
  );

  const center = points[0] ? { lat: points[0].lat, lng: points[0].lng } : DEFAULT_CENTER;

  return (
    <div className="h-[500px] rounded-lg overflow-hidden border">
      <MapContainer center={[center.lat, center.lng]} zoom={11} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ClusteredMarkers points={points} selectedId={selectedId} onSelect={onSelect} />
        <FilterCenterMarker point={filterCenter ?? null} />
        <ClickHandler onMapClick={onMapClick} />
      </MapContainer>
    </div>
  );
}

export function PingMapImpl({ point }: { point: LatLng | null }) {
  const center = point ?? DEFAULT_CENTER;

  return (
    <div className="h-[400px] rounded-lg overflow-hidden border">
      <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        {point ? <SingleMarker point={point} /> : null}
      </MapContainer>
    </div>
  );
}

function SingleMarker({ point }: { point: LatLng }) {
  const map = useMap();

  useEffect(() => {
    const marker = L.marker([point.lat, point.lng], { icon: pinIcon("#2563eb") }).addTo(map);
    return () => {
      map.removeLayer(marker);
    };
  }, [map, point]);

  return null;
}
