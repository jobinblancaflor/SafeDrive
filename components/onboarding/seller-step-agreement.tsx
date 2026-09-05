"use client";

import { Button } from "@/components/ui/button";

export const SERVICE_AGREEMENT_VERSION = "2026-08-v1";

export function SellerStepAgreement({
  accepted,
  onChange,
  onBack,
  onFinish,
  finishing,
  finishError,
}: {
  accepted: boolean;
  onChange: (v: boolean) => void;
  onBack: () => void;
  onFinish: () => void;
  finishing: boolean;
  finishError: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">Service agreement</h3>
        <p className="text-sm text-slate-500">Review and accept before you can start receiving requests.</p>
      </div>

      <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
        <p>
          By accepting this agreement, you confirm that the business details, services, service area, and
          documents you&apos;ve provided are accurate, and that you are authorized to offer the roadside
          assistance services you&apos;ve selected.
        </p>
        <p>
          Secure Signal lists your business to riders and routes service requests to us on your behalf — we do
          not connect riders to you directly inside the app. You are solely responsible for the services you
          perform, their quality and safety, and compliance with any applicable local licensing or insurance
          requirements. Secure Signal is not a party to, and assumes no liability for, any service you provide.
        </p>
        <p>
          You agree to respond to service requests routed to you in a timely manner and to keep your listed
          business hours, service area, and contact information current. Secure Signal may remove your listing
          at its discretion, including for inaccurate information, unresponsiveness, or complaints from riders.
        </p>
        <p>This is version {SERVICE_AGREEMENT_VERSION} of the agreement.</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        I have read and agree to the Service Agreement (version {SERVICE_AGREEMENT_VERSION}).
      </label>

      {finishError && <p className="text-sm text-status-critical">{finishError}</p>}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={finishing}>
          Back
        </Button>
        <Button type="button" onClick={onFinish} disabled={!accepted || finishing}>
          {finishing ? "Finishing…" : "Finish"}
        </Button>
      </div>
    </div>
  );
}
