"use client";

import { cn, formatDate } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/incident-timeline";

const DOT: Record<TimelineEvent["tone"], string> = {
  neutral: "bg-slate-400",
  good: "bg-status-success",
  warn: "bg-amber-500",
  bad: "bg-status-critical",
};

// Vertical list of an incident's history, oldest first so it reads as a
// story from the report onward.
export function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="px-4 py-3 text-xs text-slate-500">No activity recorded yet.</p>;
  }
  return (
    <ol className="relative space-y-3 px-4 py-3">
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3">
          <div className="flex flex-col items-center">
            <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", DOT[e.tone])} aria-hidden />
            {i < events.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <p className="text-sm font-medium leading-tight">{e.title}</p>
            {e.detail && <p className="text-xs text-slate-500 break-words">{e.detail}</p>}
            <p className="text-[11px] text-slate-400">
              {formatDate(e.at)}
              {e.actor ? ` · ${e.actor}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
