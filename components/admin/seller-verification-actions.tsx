"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SellerVerificationStatus } from "@/lib/supabase/types";

export function SellerVerificationActions({
  sellerUserId,
  current,
}: {
  sellerUserId: string;
  current: SellerVerificationStatus;
}) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(status: SellerVerificationStatus, reason?: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/sellers/${sellerUserId}/verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { status, note: reason } : { status }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Update failed");
      return;
    }
    setRejecting(false);
    setNote("");
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="flex flex-col items-end gap-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason shown to the seller"
          rows={2}
          maxLength={1000}
          className="w-56 rounded-md border border-slate-200 p-2 text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => setRejecting(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={loading || !note.trim()}
            onClick={() => submit("rejected", note.trim())}
          >
            Confirm reject
          </Button>
        </div>
        {error ? <p className="text-xs text-status-critical">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {current !== "approved" ? (
          <Button size="sm" disabled={loading} onClick={() => submit("approved")}>
            Approve
          </Button>
        ) : null}
        {current !== "rejected" ? (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => setRejecting(true)}>
            {current === "approved" ? "Revoke" : "Reject"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-status-critical">{error}</p> : null}
    </div>
  );
}
