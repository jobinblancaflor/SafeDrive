"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SellerReview } from "@/lib/supabase/types";

export function ReviewForm({
  sellerUserId,
  existingReview,
}: {
  sellerUserId: string;
  existingReview: SellerReview | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(existingReview?.rating ?? 5);
  const [body, setBody] = useState(existingReview?.body ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/sellers/${sellerUserId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, body: body || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? "Could not submit your review.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-white p-4">
      <p className="text-sm font-medium text-slate-900">
        {existingReview ? "Update your review" : "Leave a review"}
      </p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            className="p-0.5"
          >
            <Star
              className={cn("h-6 w-6", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")}
            />
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Optional — how did it go?"
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      />
      {error && <p className="text-sm text-status-critical">{error}</p>}
      {done && !error && <p className="text-sm text-status-success">Thanks — your review is posted.</p>}
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? "Saving…" : existingReview ? "Update review" : "Submit review"}
      </Button>
    </form>
  );
}
