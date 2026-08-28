"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InquiryStatus } from "@/lib/supabase/types";

const STATUSES: InquiryStatus[] = ["new", "contacted", "closed"];

export function InquiryStatusSelect({ inquiryId, current }: { inquiryId: string; current: InquiryStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<InquiryStatus>(current);
  const [loading, setLoading] = useState(false);

  async function change(next: InquiryStatus) {
    setLoading(true);
    const res = await fetch(`/api/admin/inquiries/${inquiryId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (res.ok) {
      setStatus(next);
      router.refresh();
    }
  }

  return (
    <select
      disabled={loading}
      value={status}
      onChange={(e) => change(e.target.value as InquiryStatus)}
      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm"
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
