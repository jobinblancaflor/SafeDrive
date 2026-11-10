import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmsProvider, type SmsProvider } from "@/lib/sms/provider";
import { SMS_SPACING_SECONDS } from "@/lib/sms/schedule";

// Called by the pg_cron "sms-dispatch" job (via pg_net) every 2s while any
// sms_outbox row is due. Claims due rows atomically, then sends them one by
// one. No user session — gated by a shared X-Dispatch-Key secret.
export const dynamic = "force-dynamic";

const MAX_ROWS = 20;
const MAX_ATTEMPTS = 3;

type OutboxRow = {
  id: string;
  incident_id: string;
  phone: string;
  message: string;
  attempts: number;
};

function checkDispatchKey(req: Request): NextResponse | null {
  const expected = process.env.SMS_DISPATCH_SECRET;
  if (!expected) {
    console.error("SMS_DISPATCH_SECRET is not configured");
    return NextResponse.json({ error: "sms dispatch is not configured" }, { status: 503 });
  }
  const a = Buffer.from(req.headers.get("x-dispatch-key") ?? "");
  const b = Buffer.from(expected);
  if (!(a.length === b.length && timingSafeEqual(a, b))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const authError = checkDispatchKey(req);
  if (authError) return authError;

  let provider: SmsProvider;
  try {
    provider = getSmsProvider();
  } catch (err) {
    console.error("sms dispatch: provider unavailable:", err);
    return NextResponse.json({ error: "sms provider is not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_due_sms", {
    max_rows: MAX_ROWS,
  });
  if (claimError) {
    console.error("sms dispatch: claim failed:", claimError);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }
  const rows = (claimed ?? []) as OutboxRow[];
  const result = { claimed: rows.length, sent: 0, skipped: 0, failed: 0, retried: 0 };
  if (!rows.length) return NextResponse.json(result);

  const incidentIds = Array.from(new Set(rows.map((r) => r.incident_id)));
  const { data: incidents, error: incidentsError } = await supabase
    .from("incidents")
    .select("id, status")
    .in("id", incidentIds);
  if (incidentsError) {
    // Leave rows in 'sending'; claim_due_sms reclaims them after 60s.
    console.error("sms dispatch: incident lookup failed:", incidentsError);
    return NextResponse.json({ error: "incident lookup failed" }, { status: 500 });
  }
  const statusById = new Map((incidents ?? []).map((i) => [i.id as string, i.status as string]));

  for (const row of rows) {
    const incidentStatus = statusById.get(row.incident_id);
    if (!incidentStatus || incidentStatus === "canceled") {
      await supabase.from("sms_outbox").update({ status: "skipped" }).eq("id", row.id);
      result.skipped++;
      continue;
    }

    const attempts = row.attempts + 1;
    try {
      const { id } = await provider.send(row.phone, row.message);
      await supabase
        .from("sms_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: id,
          attempts,
          last_error: null,
        })
        .eq("id", row.id);
      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A number Semaphore can never deliver to isn't worth retrying.
      const permanent = message === "unsupported phone number";
      if (!permanent && attempts < MAX_ATTEMPTS) {
        await supabase
          .from("sms_outbox")
          .update({
            status: "pending",
            attempts,
            last_error: message,
            send_at: new Date(Date.now() + SMS_SPACING_SECONDS * 1000).toISOString(),
          })
          .eq("id", row.id);
        result.retried++;
      } else {
        await supabase
          .from("sms_outbox")
          .update({ status: "failed", attempts, last_error: message })
          .eq("id", row.id);
        result.failed++;
      }
      console.error(`sms dispatch: send failed for outbox ${row.id}:`, message);
    }
  }

  return NextResponse.json(result);
}
