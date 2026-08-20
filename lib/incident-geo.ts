export type LatLng = { lat: number; lng: number };

export function parseLocation(loc: unknown): LatLng | null {
  if (!loc || typeof loc !== "string") return null;
  const m = loc.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}
