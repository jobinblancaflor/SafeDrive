"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

type Role = "rider" | "admin" | "authority";

export function RoleSelector({ userId, current }: { userId: string; current: Role }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(current);
  const [loading, setLoading] = useState(false);

  async function change(r: Role) {
    setLoading(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ role: r }).eq("id", userId);
    setLoading(false);
    setRole(r);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 mt-1">
      <Badge variant={role === "admin" ? "destructive" : role === "authority" ? "warning" : "secondary"}>
        {role}
      </Badge>
      <select
        disabled={loading}
        value={role}
        onChange={(e) => change(e.target.value as Role)}
        className="h-8 rounded-md border border-slate-200 bg-white text-sm px-2"
      >
        <option value="rider">rider</option>
        <option value="authority">authority</option>
        <option value="admin">admin</option>
      </select>
      {loading && <Button size="sm" variant="ghost" disabled>...</Button>}
    </div>
  );
}