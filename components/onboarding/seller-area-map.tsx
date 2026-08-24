"use client";

import dynamic from "next/dynamic";

export const SellerAreaMap = dynamic(
  () => import("@/components/onboarding/seller-area-map-impl").then((m) => m.SellerAreaMapImpl),
  {
    ssr: false,
    loading: () => <div className="h-full w-full rounded-lg border bg-slate-50" />,
  },
);
