import Link from "next/link";
import { requireProfile } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { SellerCard } from "@/components/services/seller-card";
import { SELLER_SERVICE_META, SELLER_SERVICE_OPTIONS, isSellerServiceType } from "@/lib/seller-service-type";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: { service?: string };
}) {
  await requireProfile();

  const activeFilter = isSellerServiceType(searchParams.service) ? searchParams.service : null;

  const supabase = createClient();
  let query = supabase.from("seller_directory").select("*").order("business_name");
  if (activeFilter) {
    query = query.contains("services", [activeFilter]);
  }
  const { data: sellers } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Roadside assistance services</h1>
        <p className="text-sm text-slate-500">
          Browse registered sellers near you. To request a service, contact Secure Signal — not the seller directly.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/services"
          className={cn(
            "rounded-full border px-3 py-1 text-sm",
            !activeFilter ? "border-secondary bg-secondary text-white" : "border-slate-200 text-slate-600",
          )}
        >
          All
        </Link>
        {SELLER_SERVICE_OPTIONS.map((type) => (
          <Link
            key={type}
            href={`/services?service=${type}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              activeFilter === type ? "border-secondary bg-secondary text-white" : "border-slate-200 text-slate-600",
            )}
          >
            {SELLER_SERVICE_META[type].label}
          </Link>
        ))}
      </div>

      {sellers && sellers.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(sellers as SellerDirectoryEntry[]).map((seller) => (
            <SellerCard key={seller.user_id} seller={seller} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500">
          No sellers match yet.
        </div>
      )}
    </div>
  );
}
