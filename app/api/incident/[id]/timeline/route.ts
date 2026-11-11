import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffSession } from "@/lib/incident-assignment";
import { loadIncidentTimeline } from "@/lib/incident-timeline";

// Staff-only chronological history of one incident (report, status
// changes, assignment, acknowledgement, escalation, stop pushes, SMS).
// The monitor page renders the same data server-side on load and calls
// this to refresh it after changes.
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requireStaffSession();
  if (auth.error) return auth.error;

  if (!z.string().uuid().safeParse(ctx.params.id).success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const events = await loadIncidentTimeline(auth.supabase, ctx.params.id);
  if (events.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ events });
}
