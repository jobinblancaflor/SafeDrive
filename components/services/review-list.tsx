"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly, cn } from "@/lib/utils";
import type { SellerReview } from "@/lib/supabase/types";

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("h-4 w-4", n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} />
      ))}
    </div>
  );
}

function HideToggle({ review }: { review: SellerReview }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/admin/reviews/${review.id}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: !review.hidden_by_admin }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      className="text-xs font-medium text-secondary underline-offset-2 hover:underline disabled:opacity-50"
    >
      {review.hidden_by_admin ? "Unhide" : "Hide"}
    </button>
  );
}

export function ReviewList({ reviews, isStaff }: { reviews: SellerReview[]; isStaff: boolean }) {
  if (reviews.length === 0) {
    return <p className="text-sm text-slate-500">No reviews yet.</p>;
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => (
        <div key={review.id} className="rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Stars rating={review.rating} />
              <span className="text-xs text-slate-400">{formatDateOnly(review.created_at)}</span>
              {review.hidden_by_admin && <Badge variant="warning">Hidden</Badge>}
            </div>
            {isStaff && <HideToggle review={review} />}
          </div>
          {review.body && <p className="mt-2 text-sm text-slate-600">{review.body}</p>}
        </div>
      ))}
    </div>
  );
}
