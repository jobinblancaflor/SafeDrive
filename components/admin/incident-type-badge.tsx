import { incidentTypeMeta, type IncidentTypeMeta } from "@/lib/incident-type";
import type { IncidentType } from "@/lib/supabase/types";

export function IncidentTypeBadge({
  type,
  size = "default",
}: {
  type: IncidentType | null;
  size?: "sm" | "default";
}) {
  const meta = incidentTypeMeta(type);
  if (!meta) {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-500 ${
          size === "sm" ? "h-5" : "h-6"
        }`}
      >
        Unknown type
      </span>
    );
  }
  return <ColoredChip meta={meta} size={size} />;
}

function ColoredChip({
  meta,
  size,
}: {
  meta: IncidentTypeMeta;
  size: "sm" | "default";
}) {
  const padding = size === "sm" ? "px-2 h-5 text-[11px]" : "px-2.5 h-6 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${padding}`}
      style={{
        backgroundColor: meta.hex,
        color: meta.text === "white" ? "#ffffff" : "#0f172a",
      }}
      title={`${meta.label} — ${meta.meaning}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}
