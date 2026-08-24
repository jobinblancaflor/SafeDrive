"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SellerStepBusiness, type BusinessDetails } from "@/components/onboarding/seller-step-business";
import { SellerStepArea, type AreaDetails } from "@/components/onboarding/seller-step-area";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import type { SellerProfile } from "@/lib/supabase/types";

export function SellerOnboardingWizard({
  userId,
  initial,
}: {
  userId: string;
  initial: SellerProfile | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [business, setBusiness] = useState<BusinessDetails>({
    businessName: initial?.business_name ?? "",
    services: initial?.services ?? [],
    businessHours: initial?.business_hours ?? {},
    contactPhone: initial?.contact_phone ?? "",
    contactEmail: initial?.contact_email ?? "",
  });
  const [area, setArea] = useState<AreaDetails>({
    center:
      initial?.area_lat != null && initial?.area_lng != null
        ? { lat: initial.area_lat, lng: initial.area_lng }
        : DEFAULT_CENTER,
    label: initial?.area_label ?? null,
    radiusKm: initial?.area_radius_meters ? Math.round(initial.area_radius_meters / 1000) : 10,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveBusiness() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      {
        user_id: userId,
        business_name: business.businessName,
        services: business.services,
        business_hours: business.businessHours,
        contact_phone: business.contactPhone || null,
        contact_email: business.contactEmail || null,
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setStep(2);
  }

  async function finish() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      {
        user_id: userId,
        area_label: area.label,
        area_lat: area.center.lat,
        area_lng: area.center.lng,
        area_radius_meters: area.radiusKm * 1000,
      },
      { onConflict: "user_id" },
    );
    if (upsertError) {
      setSaving(false);
      setError(upsertError.message);
      return;
    }

    const res = await fetch("/api/seller/onboarding/complete", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!res.ok || !json.ok) {
      setError(json.error ?? "Could not finish onboarding.");
      return;
    }
    router.push("/profile");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3 text-sm">
        <StepBadge n={1} active={step === 1} done={step > 1} label="Business details" />
        <div className="h-px flex-1 bg-slate-200" />
        <StepBadge n={2} active={step === 2} done={false} label="Areas supported" />
      </div>

      <div className="rounded-lg border bg-white p-6">
        {step === 1 ? (
          <SellerStepBusiness value={business} onChange={setBusiness} onNext={saveBusiness} submitting={saving} />
        ) : (
          <SellerStepArea
            value={area}
            onChange={setArea}
            onBack={() => setStep(1)}
            onFinish={finish}
            finishing={saving}
            finishError={error}
          />
        )}
        {step === 1 && error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      </div>
    </div>
  );
}

function StepBadge({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium " +
          (active
            ? "bg-secondary text-white"
            : done
              ? "bg-status-success/20 text-status-success"
              : "bg-slate-100 text-slate-500")
        }
      >
        {n}
      </span>
      <span className={active ? "font-medium text-slate-900" : "text-slate-500"}>{label}</span>
    </div>
  );
}
