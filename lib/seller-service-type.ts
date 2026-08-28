// Single source of truth for the closed roadside-assistance service
// catalog. Mirrors the pattern in lib/incident-type.ts.

export type SellerServiceType = "towing" | "battery" | "tire" | "lockout";

export type SellerServiceMeta = {
  type: SellerServiceType;
  label: string;
  description: string;
};

export const SELLER_SERVICE_META: Record<SellerServiceType, SellerServiceMeta> = {
  towing: {
    type: "towing",
    label: "Towing",
    description: "Tow a vehicle to a repair shop or safe location",
  },
  battery: {
    type: "battery",
    label: "Battery",
    description: "Jump-start or replace a dead battery",
  },
  tire: {
    type: "tire",
    label: "Tire",
    description: "Repair or replace a flat tire",
  },
  lockout: {
    type: "lockout",
    label: "Lockout",
    description: "Help a driver locked out of their own vehicle",
  },
};

export const SELLER_SERVICE_OPTIONS: SellerServiceType[] = ["towing", "battery", "tire", "lockout"];

export function isSellerServiceType(value: unknown): value is SellerServiceType {
  return typeof value === "string" && (SELLER_SERVICE_OPTIONS as string[]).includes(value);
}
