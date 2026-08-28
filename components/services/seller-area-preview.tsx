"use client";

import { SellerAreaMap } from "@/components/onboarding/seller-area-map";
import type { LatLng } from "@/lib/incident-geo";

// Read-only: SellerAreaMap is normally interactive (drag/click to move the
// center), built for the onboarding step where the seller sets their own
// location. Passing a no-op onMove means a drag or click still fires the
// handler internally but nothing re-renders in response, so the marker
// stays put — reused as-is rather than adding a new prop to the shared
// component for one read-only caller.
export function SellerAreaPreview({ center, radiusMeters }: { center: LatLng; radiusMeters: number }) {
  return (
    <div className="h-[300px]">
      <SellerAreaMap center={center} radiusMeters={radiusMeters} onMove={() => {}} />
    </div>
  );
}
