"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SellerStepBusiness, type BusinessDetails } from "@/components/onboarding/seller-step-business";
import { SellerStepServices } from "@/components/onboarding/seller-step-services";
import { SellerStepArea, type AreaDetails } from "@/components/onboarding/seller-step-area";
import { SellerStepDocuments } from "@/components/onboarding/seller-step-documents";
import { SellerStepAgreement, SERVICE_AGREEMENT_VERSION } from "@/components/onboarding/seller-step-agreement";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import { isSellerServiceType, type SellerServiceType } from "@/lib/seller-service-type";
import type { SellerProfile, SellerDocument } from "@/lib/supabase/types";

const STEP_LABELS = ["Business details", "Services", "Areas supported", "Documents", "Agreement"] as const;
type Step = 1 | 2 | 3 | 4 | 5;

export function SellerOnboardingWizard({
  userId,
  initial,
  initialDocuments,
}: {
  userId: string;
  initial: SellerProfile | null;
  initialDocuments: SellerDocument[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [business, setBusiness] = useState<BusinessDetails>({
    businessName: initial?.business_name ?? "",
    businessHours: initial?.business_hours ?? {},
    contactPhone: initial?.contact_phone ?? "",
    contactEmail: initial?.contact_email ?? "",
  });
  const [services, setServices] = useState<SellerServiceType[]>(
    (initial?.services ?? []).filter(isSellerServiceType),
  );
  const [area, setArea] = useState<AreaDetails>({
    center:
      initial?.area_lat != null && initial?.area_lng != null
        ? { lat: initial.area_lat, lng: initial.area_lng }
        : DEFAULT_CENTER,
    label: initial?.area_label ?? null,
    radiusKm: initial?.area_radius_meters ? Math.round(initial.area_radius_meters / 1000) : 10,
  });
  const [agreementAccepted, setAgreementAccepted] = useState(initial?.agreement_accepted_at != null);
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

  async function saveServices() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      { user_id: userId, services },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setStep(3);
  }

  async function saveArea() {
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
    setSaving(false);
    if (upsertError) {
      setError(upsertError.message);
      return;
    }
    setStep(4);
  }

  async function finish() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: upsertError } = await supabase.from("seller_profiles").upsert(
      {
        user_id: userId,
        agreement_accepted_at: new Date().toISOString(),
        agreement_version: SERVICE_AGREEMENT_VERSION,
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
      <div className="flex items-center gap-2 text-sm">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-4 bg-slate-200" />}
              <StepBadge n={n} active={step === n} done={step > n} label={label} />
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-white p-6">
        {step === 1 && (
          <SellerStepBusiness value={business} onChange={setBusiness} onNext={saveBusiness} submitting={saving} />
        )}
        {step === 2 && (
          <SellerStepServices
            value={services}
            onChange={setServices}
            onBack={() => setStep(1)}
            onNext={saveServices}
            submitting={saving}
          />
        )}
        {step === 3 && (
          <SellerStepArea
            value={area}
            onChange={setArea}
            onBack={() => setStep(2)}
            onNext={saveArea}
            submitting={saving}
          />
        )}
        {step === 4 && (
          <SellerStepDocuments
            userId={userId}
            initialDocuments={initialDocuments}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
          />
        )}
        {step === 5 && (
          <SellerStepAgreement
            accepted={agreementAccepted}
            onChange={setAgreementAccepted}
            onBack={() => setStep(4)}
            onFinish={finish}
            finishing={saving}
            finishError={error}
          />
        )}
        {step !== 5 && error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
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
