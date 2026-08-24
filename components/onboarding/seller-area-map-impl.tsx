"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/incident-geo";
import { TILE_URL, TILE_ATTRIBUTION } from "@/lib/map-constants";

const pinIcon = L.divIcon({
  html: `
    <div class="relative flex h-8 w-8 items-center justify-center">
      <span class="relative inline-flex h-4 w-4 rounded-full bg-secondary border-2 border-white shadow-md"></span>
    </div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function ClickToMove({ onMove }: { onMove: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyTo({ center }: { center: LatLng }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.flyTo([center.lat, center.lng], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fly when center changes externally (search/geolocation), not on our own click-drag updates
  }, [center.lat, center.lng]);
  return null;
}

export function SellerAreaMapImpl({
  center,
  radiusMeters,
  onMove,
}: {
  center: LatLng;
  radiusMeters: number;
  onMove: (p: LatLng) => void;
}) {
  return (
    <div className="h-full w-full overflow-hidden rounded-lg border">
      <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height: "100%", width: "100%" }}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <Marker
          position={[center.lat, center.lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const marker = e.target as L.Marker;
              const pos = marker.getLatLng();
              onMove({ lat: pos.lat, lng: pos.lng });
            },
          }}
        />
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusMeters}
          pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.15 }}
        />
        <ClickToMove onMove={onMove} />
        <FlyTo center={center} />
      </MapContainer>
    </div>
  );
}

