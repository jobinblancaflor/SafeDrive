"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SELLER_SERVICE_META, SELLER_SERVICE_OPTIONS, type SellerServiceType } from "@/lib/seller-service-type";

export function SellerStepServices({
  value,
  onChange,
  onBack,
  onNext,
  submitting,
}: {
  value: SellerServiceType[];
  onChange: (next: SellerServiceType[]) => void;
  onBack: () => void;
  onNext: () => void;
  submitting?: boolean;
}) {
  function toggle(type: SellerServiceType) {
    if (value.includes(type)) {
      onChange(value.filter((v) => v !== type));
    } else {
      onChange([...value, type]);
    }
  }

  const canContinue = value.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>Services offered</Label>
        <p className="text-sm text-slate-500">Pick every service you can respond to. At least one is required.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SELLER_SERVICE_OPTIONS.map((type) => {
          const meta = SELLER_SERVICE_META[type];
          const checked = value.includes(type);
          return (
            <label
              key={type}
              className={
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors " +
                (checked ? "border-secondary bg-secondary/5" : "border-slate-200 hover:bg-slate-50")
              }
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(type)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">{meta.label}</span>
                <span className="block text-xs text-slate-500">{meta.description}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="button" disabled={!canContinue || submitting} onClick={onNext}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
