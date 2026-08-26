"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

const CONFIRM_PHRASE = "DELETE";

export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (deleting) return;
    setOpen(false);
    setConfirmText("");
    setError(null);
  }

  async function onDelete() {
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setDeleting(false);
      setError(json.error ?? "Could not delete your account.");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-status-critical/30 bg-status-critical/5 p-4">
      <h3 className="text-sm font-semibold text-status-critical">Delete account</h3>
      <p className="mt-1 text-sm text-slate-600">
        Permanently deletes your account and all associated data — profile, emergency contacts,
        devices, messages, and subscription history. This can&apos;t be undone.
      </p>
      <Button type="button" variant="destructive" className="mt-3" onClick={() => setOpen(true)}>
        Delete my account
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="text-base font-semibold text-slate-900">Delete your account?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently deletes your profile, emergency contacts, devices, messages, and
              subscription history. There is no way to undo this.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm.
            </p>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={deleting}
              className="mt-2"
            />
            {error && <p className="mt-2 text-sm text-status-critical">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" disabled={deleting} onClick={close}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleting || confirmText !== CONFIRM_PHRASE}
                onClick={onDelete}
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
