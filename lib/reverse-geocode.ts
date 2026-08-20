// Reverse-geocode via OpenStreetMap Nominatim (free, low rate limit ~1 req/sec).
// Results are cached in-memory by rounded coords to avoid duplicate hits.

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function key(lat: number, lng: number) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

let lastCall = 0;

async function fetchNominatim(lat: number, lng: number): Promise<string | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastCall));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "18");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "SecureSignalAdmin/1.0 (contact@securesignal.app)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { display_name?: string };
    return json.display_name ?? null;
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const k = key(lat, lng);
  const cached = cache.get(k);
  if (cached !== undefined) return cached;
  const pending = inflight.get(k);
  if (pending) return pending;
  const p = fetchNominatim(lat, lng).then((v) => {
    cache.set(k, v ?? "");
    inflight.delete(k);
    return v;
  });
  inflight.set(k, p);
  return p;
}