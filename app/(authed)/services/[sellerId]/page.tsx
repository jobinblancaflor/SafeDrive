import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { SellerAreaPreview } from "@/components/services/seller-area-preview";
import { ReviewList } from "@/components/services/review-list";
import { ReviewForm } from "@/components/services/review-form";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import { formatBusinessHours } from "@/lib/business-hours";
import { DEFAULT_CENTER } from "@/lib/map-constants";
import type { SellerDirectoryEntry, SellerReview } from "@/lib/supabase/types";

export default async function SellerDetailPage({ params }: { params: { sellerId: string } }) {
  const profile = await requireProfile();
  const isStaff = profile.role === "admin" || profile.role === "authority";

  const supabase = createClient();
  const { data: seller } = await supabase
    .from("seller_directory")
    .select("*")
    .eq("user_id", params.sellerId)
    .maybeSingle();

  if (!seller) notFound();
  const entry = seller as SellerDirectoryEntry;

  const { data: reviewRows } = await supabase
    .from("seller_reviews")
    .select("*")
    .eq("seller_user_id", entry.user_id)
    .order("created_at", { ascending: false });
  const reviews = (reviewRows ?? []) as SellerReview[];
  const visibleReviews = reviews.filter((r) => !r.hidden_by_admin);
  const averageRating =
    visibleReviews.length > 0
      ? visibleReviews.reduce((sum, r) => sum + r.rating, 0) / visibleReviews.length
      : null;

  let existingReview: SellerReview | null = null;
  let canReview = false;
  if (profile.role === "rider") {
    existingReview = reviews.find((r) => r.rider_user_id === profile.id) ?? null;
    if (existingReview) {
      canReview = true;
    } else {
      const { data: inquiry } = await supabase
        .from("seller_inquiries")
        .select("id")
        .eq("seller_user_id", entry.user_id)
        .eq("rider_user_id", profile.id)
        .limit(1)
        .maybeSingle();
      canReview = Boolean(inquiry);
    }
  }

  const center =
    entry.area_lat != null && entry.area_lng != null
      ? { lat: entry.area_lat, lng: entry.area_lng }
      : DEFAULT_CENTER;
  const radiusMeters = entry.area_radius_meters ?? 10_000;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{entry.business_name ?? "Unnamed business"}</h1>
        {entry.area_label && <p className="text-sm text-slate-500">{entry.area_label}</p>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {entry.services.filter(isSellerServiceType).map((type) => (
          <Badge key={type} variant="secondary">
            {SELLER_SERVICE_META[type].label}
          </Badge>
        ))}
      </div>

      <div className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Business hours</h2>
        <dl className="space-y-1 text-sm">
          {formatBusinessHours(entry.business_hours).map(({ day, label, text }) => (
            <div key={day} className="flex justify-between text-slate-600">
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Service area</h2>
        <SellerAreaPreview center={center} radiusMeters={radiusMeters} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Reviews</h2>
          {averageRating != null && (
            <span className="text-sm text-slate-500">
              {averageRating.toFixed(1)} / 5 ({visibleReviews.length})
            </span>
          )}
        </div>
        <ReviewList reviews={isStaff ? reviews : visibleReviews} isStaff={isStaff} />
        {profile.role === "rider" &&
          (canReview ? (
            <ReviewForm sellerUserId={entry.user_id} existingReview={existingReview} />
          ) : (
            <p className="text-sm text-slate-500">Contact us about this seller to leave a review.</p>
          ))}
      </div>

      <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4">
        <p className="text-sm text-slate-700">
          Requests go through Secure Signal — we&apos;ll never share your contact details with the seller directly
          until you choose to.
        </p>
        <Link
          href={`/services/${entry.user_id}/request`}
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          Request this service
        </Link>
      </div>
    </div>
  );
}
