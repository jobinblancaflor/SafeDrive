import { notFound } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { InquiryForm } from "@/components/services/inquiry-form";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";

export default async function RequestServicePage({ params }: { params: { sellerId: string } }) {
  await requireRole(["rider"]);

  const supabase = createClient();
  const { data: seller } = await supabase
    .from("seller_directory")
    .select("*")
    .eq("user_id", params.sellerId)
    .maybeSingle();

  if (!seller) notFound();
  const entry = seller as SellerDirectoryEntry;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Request service</h1>
        <p className="text-sm text-slate-500">
          For {entry.business_name ?? "this seller"}. Secure Signal handles the request — the seller never sees your
          contact details.
        </p>
      </div>
      <InquiryForm sellerUserId={entry.user_id} sellerName={entry.business_name ?? "this seller"} />
    </div>
  );
}
