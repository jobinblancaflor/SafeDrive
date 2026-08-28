"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import type { BusinessHours } from "@/lib/supabase/types";

const DAYS: { key: keyof BusinessHours; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

export type BusinessDetails = {
  businessName: string;
  businessHours: BusinessHours;
  contactPhone: string;
  contactEmail: string;
};

export function SellerStepBusiness({
  value,
  onChange,
  onNext,
  submitting,
}: {
  value: BusinessDetails;
  onChange: (next: BusinessDetails) => void;
  onNext: () => void;
  submitting?: boolean;
}) {
  function setDay(day: keyof BusinessHours, patch: Partial<{ open: string; close: string; closed: boolean }>) {
    const current = value.businessHours[day] ?? { open: "09:00", close: "17:00" };
    onChange({
      ...value,
      businessHours: { ...value.businessHours, [day]: { ...current, ...patch } },
    });
  }

  const canContinue = value.businessName.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label htmlFor="biz-name">Business name</Label>
        <Input
          id="biz-name"
          required
          value={value.businessName}
          onChange={(e) => onChange({ ...value, businessName: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Business hours</Label>
        <div className="space-y-2 rounded-lg border p-3">
          {DAYS.map(({ key, label }) => {
            const day = value.businessHours[key];
            const closed = day?.closed ?? false;
            return (
              <div key={key} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-600">{label}</span>
                <label className="flex items-center gap-1.5 text-slate-500">
                  <input
                    type="checkbox"
                    checked={closed}
                    onChange={(e) => setDay(key, { closed: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  Closed
                </label>
                {!closed && (
                  <>
                    <input
                      type="time"
                      value={day?.open ?? "09:00"}
                      onChange={(e) => setDay(key, { open: e.target.value })}
                      className="h-8 rounded-md border border-slate-200 px-2 text-sm"
                    />
                    <span className="text-slate-400">to</span>
                    <input
                      type="time"
                      value={day?.close ?? "17:00"}
                      onChange={(e) => setDay(key, { close: e.target.value })}
                      className="h-8 rounded-md border border-slate-200 px-2 text-sm"
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="biz-phone">Contact phone</Label>
          <PhoneInput
            id="biz-phone"
            value={value.contactPhone}
            onChange={(v) => onChange({ ...value, contactPhone: v })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="biz-email">Contact email</Label>
          <Input
            id="biz-email"
            type="email"
            value={value.contactEmail}
            onChange={(e) => onChange({ ...value, contactEmail: e.target.value })}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" disabled={!canContinue || submitting} onClick={onNext}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
