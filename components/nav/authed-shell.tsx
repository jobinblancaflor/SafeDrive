"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Sidebar } from "@/components/nav/sidebar";
import { Topbar } from "@/components/nav/topbar";
import { LogoutButton } from "@/components/nav/logout-button";
import { Wordmark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import type { AppProfile } from "@/lib/rbac";

export function AuthedShell({
  profile,
  unreadCount,
  children,
}: {
  profile: AppProfile;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-white transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-5">
          <Link href="/" className="flex items-center">
            <Wordmark />
          </Link>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <Sidebar role={profile.role} unreadCount={unreadCount} onNavigate={() => setDrawerOpen(false)} />
        <div className="mt-auto border-t p-4">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <Topbar profile={profile} onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 bg-slate-50 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
