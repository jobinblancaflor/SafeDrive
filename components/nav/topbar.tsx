import { Badge } from "@/components/ui/badge";
import type { AppProfile } from "@/lib/rbac";

export function Topbar({ profile }: { profile: AppProfile }) {
  return (
    <header className="h-14 bg-white border-b flex items-center justify-between px-6">
      <div className="text-sm text-slate-500">
        Signed in as <span className="text-slate-900 font-medium">{profile.fullname}</span>
      </div>
      <Badge variant={profile.role === "admin" ? "destructive" : profile.role === "authority" ? "warning" : "secondary"}>
        {profile.role}
      </Badge>
    </header>
  );
}
