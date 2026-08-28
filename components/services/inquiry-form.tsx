"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SELLER_SERVICE_META, SELLER_SERVICE_OPTIONS, type SellerServiceType } from "@/lib/seller-service-type";

export function InquiryForm({ sellerUserId, sellerName }: { sellerUserId: string; sellerName: string }) {
  const router = useRouter();
  const [serviceType, setServiceType] = useState<SellerServiceType>(SELLER_SERVICE_OPTIONS[0]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/seller-inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seller_user_id: sellerUserId, service_type: serviceType, message }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? "Could not send your request.");
      return;
    }
    setSent(true);
    setTimeout(() => router.push("/services"), 1500);
  }

  if (sent) {
    return (
      <div className="rounded-lg border bg-status-success/10 p-4 text-sm text-status-success">
        Request sent to Secure Signal. We&apos;ll reach out to arrange {sellerName}&apos;s service.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Service needed</label>
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as SellerServiceType)}
          className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        >
          {SELLER_SERVICE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {SELLER_SERVICE_META[type].label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tell us what&apos;s going on</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={1}
          maxLength={2000}
          rows={4}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          placeholder="Location, vehicle details, anything the team should know."
        />
      </div>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Sending…" : "Send to Secure Signal"}
      </Button>
    </form>
  );
}
