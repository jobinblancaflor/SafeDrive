import { requireRole } from "@/lib/rbac";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InquiryStatusSelect } from "@/components/admin/inquiry-status-select";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import { formatDate } from "@/lib/utils";
import type { SellerInquiry } from "@/lib/supabase/types";

export default async function AdminInquiriesPage() {
  await requireRole(["admin"]);
  const supabase = createClient();
  const { data: inquiries } = await supabase
    .from("seller_inquiries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Service requests</CardTitle>
          <CardDescription>Rider requests routed from the seller directory — work the queue here.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries?.length ? (
                (inquiries as SellerInquiry[]).map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell>
                      {isSellerServiceType(inquiry.service_type)
                        ? SELLER_SERVICE_META[inquiry.service_type].label
                        : inquiry.service_type}
                    </TableCell>
                    <TableCell className="max-w-md truncate">{inquiry.message}</TableCell>
                    <TableCell>{formatDate(inquiry.created_at)}</TableCell>
                    <TableCell>
                      <InquiryStatusSelect inquiryId={inquiry.id} current={inquiry.status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-slate-500">
                    No requests yet.
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
