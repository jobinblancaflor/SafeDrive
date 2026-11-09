import Link from "next/link";
import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SellerVerificationActions } from "@/components/admin/seller-verification-actions";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import { cn, formatDate } from "@/lib/utils";
import type { SellerDocument, SellerProfile, SellerVerificationStatus } from "@/lib/supabase/types";

const FILTERS: SellerVerificationStatus[] = ["pending", "approved", "rejected"];

const DOC_LABEL: Record<SellerDocument["document_type"], string> = {
  business_permit: "Business permit",
  government_id: "Government ID",
};

const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
} as const;

// Signed URLs are short-lived: the documents bucket is private and these
// links should stop working soon after a reviewer leaves the page.
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireRole(["admin"]);
  const status: SellerVerificationStatus = FILTERS.includes(searchParams.status as SellerVerificationStatus)
    ? (searchParams.status as SellerVerificationStatus)
    : "pending";

  const supabase = createClient();
  const { data: sellersData } = await supabase
    .from("seller_profiles")
    .select("*")
    .not("onboarding_completed_at", "is", null)
    .eq("verification_status", status)
    .order("onboarding_completed_at", { ascending: status === "pending" })
    .limit(100);
  const sellers = (sellersData ?? []) as SellerProfile[];

  const userIds = sellers.map((s) => s.user_id);
  const [{ data: ownersData }, { data: docsData }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, fullname").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; fullname: string }[] }),
    userIds.length
      ? supabase.from("seller_documents").select("*").in("seller_user_id", userIds)
      : Promise.resolve({ data: [] as SellerDocument[] }),
  ]);
  const ownerName = new Map((ownersData ?? []).map((o) => [o.id, o.fullname]));
  const docs = (docsData ?? []) as SellerDocument[];

  const signed = new Map<string, string>();
  if (docs.length) {
    const { data: urls } = await supabase.storage
      .from("seller_documents")
      .createSignedUrls(
        docs.map((d) => d.storage_path),
        SIGNED_URL_TTL_SECONDS,
      );
    for (const u of urls ?? []) {
      if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Seller verification</CardTitle>
          <CardDescription>
            Review business documents. Only approved sellers appear in the rider directory.
          </CardDescription>
          <div className="flex gap-2 pt-2">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={`/admin/sellers?status=${f}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm capitalize",
                  f === status
                    ? "border-transparent bg-primary-container font-medium text-primary"
                    : "border-slate-200 text-slate-600 hover:bg-slate-100",
                )}
              >
                {f}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Services</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.length ? (
                sellers.map((seller) => {
                  const sellerDocs = docs.filter((d) => d.seller_user_id === seller.user_id);
                  return (
                    <TableRow key={seller.user_id}>
                      <TableCell>
                        <div className="font-medium">{seller.business_name ?? "—"}</div>
                        <div className="text-xs text-slate-500">
                          {ownerName.get(seller.user_id) ?? "Unknown owner"}
                          {seller.contact_phone ? ` · ${seller.contact_phone}` : ""}
                        </div>
                        <Link href={`/admin/users/${seller.user_id}`} className="text-xs text-secondary hover:underline">
                          View user
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        {seller.services
                          .map((s) => (isSellerServiceType(s) ? SELLER_SERVICE_META[s].label : s))
                          .join(", ") || "—"}
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-sm">{seller.area_label ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {sellerDocs.length ? (
                            sellerDocs.map((d) => {
                              const url = signed.get(d.storage_path);
                              return url ? (
                                <a
                                  key={d.id}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-secondary hover:underline"
                                >
                                  {DOC_LABEL[d.document_type]}
                                </a>
                              ) : (
                                <span key={d.id} className="text-slate-400">
                                  {DOC_LABEL[d.document_type]} (unavailable)
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-slate-400">None uploaded</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {seller.onboarding_completed_at ? formatDate(seller.onboarding_completed_at) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[seller.verification_status]} className="capitalize">
                          {seller.verification_status}
                        </Badge>
                        {seller.verification_note ? (
                          <p className="mt-1 max-w-[14rem] text-xs text-slate-500">{seller.verification_note}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <SellerVerificationActions
                          sellerUserId={seller.user_id}
                          current={seller.verification_status}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-slate-500">
                    No {status} sellers.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
