// Single source of truth for how Secure Signal categorises an SOS trigger.
// Mirrors the `public.incident_type` postgres enum.

import type { IncidentType } from "@/lib/supabase/types";

export type { IncidentType };

export type IncidentTypeMeta = {
  type: IncidentType;
  label: string;
  emoji: string;
  hex: string; // exact color from the incident-type spec
  text: "white" | "slate"; // readable text color on top of `hex`
  meaning: string;
};

export const INCIDENT_TYPE_META: Record<IncidentType, IncidentTypeMeta> = {
  "SOS Button": {
    type: "SOS Button",
    label: "SOS Button",
    emoji: "🔴",
    hex: "#D32F2F",
    text: "white",
    meaning: "Manual emergency activation",
  },
  "SOS Volume keys": {
    type: "SOS Volume keys",
    label: "SOS Volume Keys",
    emoji: "🟠",
    hex: "#F57C00",
    text: "white",
    meaning: "Hardware button activation",
  },
  "SOS USB": {
    type: "SOS USB",
    label: "SOS USB",
    emoji: "🟡",
    hex: "#FBC02D",
    text: "slate",
    meaning: "Charger / USB-triggered SOS",
  },
  "SOS Fall Detected": {
    type: "SOS Fall Detected",
    label: "SOS Fall Detected",
    emoji: "🟣",
    hex: "#7B1FA2",
    text: "white",
    meaning: "Automatic fall detection",
  },
};

export const INCIDENT_TYPE_OPTIONS: IncidentType[] = [
  "SOS Button",
  "SOS Volume keys",
  "SOS USB",
  "SOS Fall Detected",
];

export function isIncidentType(value: unknown): value is IncidentType {
  return (
    typeof value === "string" &&
    (INCIDENT_TYPE_OPTIONS as string[]).includes(value)
  );
}

export function incidentTypeMeta(
  value: IncidentType | null | undefined,
): IncidentTypeMeta | null {
  if (!value) return null;
  return INCIDENT_TYPE_META[value] ?? null;
}
