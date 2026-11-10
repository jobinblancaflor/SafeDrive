/**
 * How long a one-shot ping may go unanswered before the dashboard calls
 * it "no response" and offers a retry. Derived, never stored (see
 * migration 0024), so this can change without touching data.
 */
export const PING_TIMEOUT_SECONDS = 60;

export type PingRow = {
  id: string;
  ping_date: string;
  status: "sent" | "received";
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  received_at: string | null;
  located_at: string | null;
  push_error: string | null;
};

export const PING_SELECT =
  "id, ping_date, status, lat, lng, accuracy, received_at, located_at, push_error";

export type PingState = "push_failed" | "waiting" | "no_response" | "received" | "located";

export function pingState(p: PingRow, nowMs: number = Date.now()): PingState {
  if (p.lat !== null && p.lng !== null) return "located";
  if (p.status === "received") return "received";
  if (p.push_error) return "push_failed";
  const ageSeconds = (nowMs - Date.parse(p.ping_date)) / 1000;
  return ageSeconds >= PING_TIMEOUT_SECONDS ? "no_response" : "waiting";
}

export const PING_STATE_LABEL: Record<PingState, string> = {
  push_failed: "Push failed",
  waiting: "Waiting for device",
  no_response: "No response",
  received: "Received, no location yet",
  located: "Located",
};

/** States where sending a fresh ping is the useful next step. */
export function canRetry(state: PingState): boolean {
  return state === "push_failed" || state === "no_response";
}
