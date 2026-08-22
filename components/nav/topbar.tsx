import { Menu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AppProfile } from "@/lib/rbac";

export function Topbar({ profile, onMenuClick }: { profile: AppProfile; onMenuClick?: () => void }) {
  return (
    <header className="h-14 bg-white border-b flex items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open menu"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        )}
        <div className="min-w-0 truncate text-sm text-slate-500">
          Signed in as <span className="text-slate-900 font-medium">{profile.fullname}</span>
        </div>
      </div>
      <Badge variant={profile.role === "admin" ? "destructive" : profile.role === "authority" ? "warning" : "secondary"}>
        {profile.role}
      </Badge>
    </header>
  );
}
