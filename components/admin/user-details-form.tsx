"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";

export function UserDetailsForm({
  userId,
  initial,
}: {
  userId: string;
  initial: { fullname: string; phone: string | null };
}) {
  const router = useRouter();
  const [fullname, setFullname] = useState(initial.fullname);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  const dirty = fullname.trim() !== initial.fullname || phone !== (initial.phone ?? "");

  async function onSave() {
    setSaving(true);
    setStatus(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullname: fullname.trim(), phone: phone || null }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!res.ok || !json.ok) {
      setStatus({ kind: "err", message: json.error ?? "Failed to save" });
      return;
    }
    setStatus({ kind: "ok", message: "Saved." });
    router.refresh();
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="user-fullname">Full name</Label>
        <Input id="user-fullname" value={fullname} onChange={(e) => setFullname(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="user-phone">Phone</Label>
        <PhoneInput id="user-phone" value={phone} onChange={setPhone} />
      </div>
      <div className="flex items-end gap-2">
        <Button type="button" onClick={onSave} disabled={!dirty || saving || !fullname.trim()}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {status && (
          <span className={status.kind === "ok" ? "text-sm text-status-success" : "text-sm text-status-critical"}>
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
