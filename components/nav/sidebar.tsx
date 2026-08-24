"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/rbac";

const adminLinks = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/incidents", label: "Incidents" },
  { href: "/monitor", label: "Monitor" },
  { href: "/admin/ping", label: "Ping" },
  { href: "/admin/settings", label: "Settings" },
];

const authorityLinks = [
  { href: "/authority/incidents", label: "Incidents" },
  { href: "/monitor", label: "Monitor" },
  { href: "/authority/ping", label: "Ping" },
];

const riderLinks = [{ href: "/incidents", label: "Incidents" }];

const sellerLinks = [{ href: "/onboarding/seller", label: "Business profile" }];

const commonLinks = [
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
];

export function Sidebar({
  role,
  unreadCount,
  onNavigate,
}: {
  role: AppRole;
  unreadCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items =
    role === "admin"
      ? adminLinks
      : role === "authority"
        ? authorityLinks
        : role === "seller"
          ? sellerLinks
          : riderLinks;

  return (
    <nav className="flex flex-col px-3 py-4 gap-1 text-sm">
      <p className="px-3 text-xs uppercase text-slate-400 font-medium tracking-wide">{role}</p>
      {items.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onClick={onNavigate}
          className={cn(
            "px-3 py-2 rounded-md hover:bg-slate-100 transition-colors",
            pathname?.startsWith(l.href) && "bg-primary-container text-primary font-medium hover:bg-primary-container",
          )}
        >
          {l.label}
          {l.href.endsWith("/incidents") && unreadCount > 0 ? (
            <span className="ml-2 inline-flex items-center justify-center text-xs bg-primary text-white rounded-full px-1.5 h-5 min-w-5">
              {unreadCount}
            </span>
          ) : null}
        </Link>
      ))}
      <p className="px-3 pt-4 text-xs uppercase text-slate-400 font-medium tracking-wide">Account</p>
      {commonLinks.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onClick={onNavigate}
          className={cn(
            "px-3 py-2 rounded-md hover:bg-slate-100 transition-colors",
            pathname === l.href && "bg-primary-container text-primary font-medium hover:bg-primary-container",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
