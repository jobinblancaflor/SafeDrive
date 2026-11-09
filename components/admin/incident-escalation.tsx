"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffMember = { id: string; fullname: string; role: "admin" | "authority" };

/** Badge for an unacknowledged incident; level 0 still shows "Unacknowledged". */
export function EscalationBadge({
  level,
  acknowledged,
  className,
}: {
  level: number;
  acknowledged: boolean;
  className?: string;
}) {
  if (acknowledged) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        level >= 2
          ? "bg-status-critical text-white"
          : level === 1
            ? "bg-status-warning/15 text-status-warning"
            : "bg-slate-100 text-slate-600",
        className,
      )}
      title="No staff member has acknowledged this incident yet"
    >
      {level > 0 ? <AlertTriangle className="h-3 w-3" aria-hidden /> : null}
      {level > 0 ? `Escalated L${level}` : "Unacknowledged"}
    </span>
  );
}

/** Loads the staff list once for the assignee picker. */
export function useStaffList(): StaffMember[] {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff")
      .then((r) => (r.ok ? r.json() : { staff: [] }))
      .then((j: { staff?: StaffMember[] }) => {
        if (!cancelled) setStaff(j.staff ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return staff;
}

/**
 * Banner listing open incidents nobody has acknowledged, with a short beep
 * whenever an incident escalates to a new level while the page is open.
 */
export function EscalationBanner({
  incidents,
  onSelect,
}: {
  incidents: { id: string; escalation_level: number; acknowledged_at: string | null; status: string; user_name: string | null }[];
  onSelect: (id: string) => void;
}) {
  const open = incidents.filter((i) => !i.acknowledged_at && i.status !== "canceled");
  const escalated = open.filter((i) => i.escalation_level > 0).sort((a, b) => b.escalation_level - a.escalation_level);

  const seen = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const current = new Map(open.map((i) => [i.id, i.escalation_level]));
    const prev = seen.current;
    seen.current = current;
    if (!prev) return; // first render: don't beep for what was already there
    const rose = open.some((i) => i.escalation_level > (prev.get(i.id) ?? 0));
    if (rose) beep();
  });

  if (!open.length) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3 text-sm",
        escalated.length
          ? "border-status-critical/40 bg-status-critical/10 text-status-critical"
          : "border-status-warning/40 bg-status-warning/10 text-status-warning",
      )}
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        {open.length} unacknowledged incident{open.length === 1 ? "" : "s"}
        {escalated.length ? ` · ${escalated.length} escalated` : ""}
      </span>
      <span className="flex flex-wrap gap-2">
        {(escalated.length ? escalated : open).slice(0, 5).map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => onSelect(i.id)}
            className="rounded border border-current/30 bg-white/60 px-2 py-0.5 text-xs font-medium hover:bg-white"
          >
            {i.user_name ?? i.id.slice(0, 8)}
            {i.escalation_level > 0 ? ` · L${i.escalation_level}` : ""}
          </button>
        ))}
      </span>
    </div>
  );
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    // Autoplay policies may block audio before user interaction — ignore.
  }
}
