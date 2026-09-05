import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SELLER_SERVICE_META, isSellerServiceType } from "@/lib/seller-service-type";
import type { SellerDirectoryEntry } from "@/lib/supabase/types";

export function SellerCard({ seller }: { seller: SellerDirectoryEntry }) {
  return (
    <Link href={`/services/${seller.user_id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>{seller.business_name ?? "Unnamed business"}</CardTitle>
          {seller.area_label && <CardDescription>{seller.area_label}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 pt-0">
          {seller.services.filter(isSellerServiceType).map((type) => (
            <Badge key={type} variant="secondary">
              {SELLER_SERVICE_META[type].label}
            </Badge>
          ))}
        </CardContent>
      </Card>
    </Link>
  );
}
