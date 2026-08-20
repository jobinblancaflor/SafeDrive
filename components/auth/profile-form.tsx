"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function ProfileForm({ initial }: { initial: { fullname: string; phone: string } }) {
  const router = useRouter();
  const [fullname, setFullname] = useState(initial.fullname);
  const [phone, setPhone] = useState(initial.phone);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ fullname, phone })
      .eq("id", user.id);
    setLoading(false);
    if (error) setStatus(error.message);
    else {
      setStatus("Saved.");
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="fullname">Full name</Label>
        <Input id="fullname" required value={fullname} onChange={(e) => setFullname(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {status && <p className="text-sm text-slate-600">{status}</p>}
      <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
    </form>
  );
}
