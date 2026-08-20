"use client";

import dynamic from "next/dynamic";
export type { MapIncident } from "@/components/map/leaflet-map-impl";

export const IncidentMap = dynamic(
  () => import("@/components/map/leaflet-map-impl").then((m) => m.IncidentMapImpl),
  {
    ssr: false,
    loading: () => <div className="h-[500px] rounded-lg border bg-slate-50" />,
  },
);

export const PingMap = dynamic(
  () => import("@/components/map/leaflet-map-impl").then((m) => m.PingMapImpl),
  {
    ssr: false,
    loading: () => <div className="h-[400px] rounded-lg border bg-slate-50" />,
  },
);
