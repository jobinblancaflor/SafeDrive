"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SellerAreaMap } from "@/components/onboarding/seller-area-map";
import type { LatLng } from "@/lib/incident-geo";

export type AreaDetails = {
  center: LatLng;
  label: string | null;
  radiusKm: number;
};

type SearchResult = { label: string; lat: number; lng: number };

export function SellerStepArea({
  value,
  onChange,
  onBack,
  onNext,
  submitting,
}: {
  value: AreaDetails;
  onChange: (next: AreaDetails) => void;
  onBack: () => void;
  onNext: () => void;
  submitting?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const askedGeolocation = useRef(false);

  useEffect(() => {
    if (askedGeolocation.current) return;
    askedGeolocation.current = true;
    if (value.label || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          ...value,
          center: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          label: "Your current location",
        });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  async function runSearch() {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const json = (await res.json().catch(() => ({}))) as { results?: SearchResult[] };
      setResults(json.results ?? []);
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r: SearchResult) {
    onChange({ ...value, center: { lat: r.lat, lng: r.lng }, label: r.label });
    setResults([]);
    setQuery("");
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="area-search">Search for your area</Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="area-search"
            placeholder="City, neighborhood, or address"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                runSearch();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={runSearch} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {results.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-auto rounded-md border bg-white text-sm shadow-sm">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {locating
            ? "Locating you…"
            : value.label ?? `Center: ${value.center.lat.toFixed(4)}, ${value.center.lng.toFixed(4)}`}
          {" — or click/drag the pin on the map."}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="area-radius">Service radius</Label>
          <span className="text-sm font-medium text-slate-700">{value.radiusKm} km</span>
        </div>
        <input
          id="area-radius"
          type="range"
          min={1}
          max={100}
          step={1}
          value={value.radiusKm}
          onChange={(e) => onChange({ ...value, radiusKm: Number(e.target.value) })}
          className="mt-2 w-full accent-secondary"
        />
      </div>

      <div className="h-[360px]">
        <SellerAreaMap
          center={value.center}
          radiusMeters={value.radiusKm * 1000}
          onMove={(p) => onChange({ ...value, center: p, label: null })}
        />
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" onClick={onNext} disabled={submitting}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

