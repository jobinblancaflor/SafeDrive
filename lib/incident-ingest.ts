import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Driver ids come from the mobile app as opaque strings and must resolve to
// a real profiles.id (a uuid column) to be usable. Device ids do NOT need
// resolving the same way: incidents.device_id / incident_logs.device_id are
// plain text columns on this project holding the hardware's own id directly
// (e.g. "bff60f44be2a18fe", an Android hardware id — not shaped like a uuid
// at all), not a uuid FK to devices.id despite what the original migration
// files describe — the live schema has drifted from them. A safety report
// should never be dropped over an identity field not resolving, so
// resolveUserId degrades to null instead of throwing on a bad/unknown id.

/** Resolve a driver id to a real profiles.id, or null if it doesn't (yet) exist. */
export async function resolveUserId(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId || !UUID_RE.test(userId)) return null;
  const { data } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  return data?.id ?? null;
}

/**
 * Best-effort bookkeeping: keep the `devices` table's last_seen/user_id in
 * sync with sightings of this hardware id, auto-registering it on first
 * sight. Never blocks or fails the caller — the incident/log row itself
 * stores the raw device id string regardless of whether this succeeds.
 */
export async function touchDevice(
  supabase: SupabaseClient,
  deviceUuid: string | null | undefined,
  ownerUserId: string | null,
): Promise<void> {
  const uuid = deviceUuid?.trim();
  if (!uuid) return;

  // A single atomic upsert rather than select-then-branch: two requests for
  // a never-before-seen device can easily race between the check and the
  // insert (this app has already hit that in testing — a duplicate-key
  // error on devices_device_uuid_key from a plain insert after a select
  // that came back empty). ON CONFLICT sidesteps it entirely.
  //
  // PostgREST's upsert only SETs columns actually present in the payload,
  // so omitting user_id here (when we don't have one to assign) leaves an
  // existing device's owner untouched instead of clobbering it with null.
  const row: { device_uuid: string; last_seen: string; user_id?: string } = {
    device_uuid: uuid,
    last_seen: new Date().toISOString(),
  };
  if (ownerUserId) row.user_id = ownerUserId;

  const { error } = await supabase.from("devices").upsert(row, { onConflict: "device_uuid" });
  if (error) console.error("touchDevice upsert failed:", error);
}
