"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "rider" | "admin" | "authority" | "seller";

export function InviteUserDialog({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (message: string) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [fullname, setFullname] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState<Role>("rider");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setEmail("");
      setFullname("");
      setPhone("");
      setRole("rider");
      setError(null);
      setPending(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, fullname, phone: phone || undefined, role }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to send invite");
        return;
      }
      onInvited(`Invite sent to ${email}`);
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">Invite a user</h2>
        <p className="mt-1 text-sm text-slate-500">
          They&apos;ll get an email to set their password and sign in.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-fullname">Full name</Label>
            <Input id="invite-fullname" required value={fullname} onChange={(e) => setFullname(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-phone">Phone (optional)</Label>
            <Input id="invite-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="rider">rider</option>
              <option value="seller">seller</option>
              <option value="authority">authority</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
