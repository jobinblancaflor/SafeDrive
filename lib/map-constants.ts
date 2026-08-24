import type { LatLng } from "@/lib/incident-geo";

// Kept side-effect-free (no leaflet/CSS imports) so anything that just needs
// these values doesn't drag the whole Leaflet bundle into its chunk.
export const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 };
export const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
