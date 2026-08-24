"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setLoading(false);
    if (res.ok && json.ok) {
      setStatus({ kind: "ok", message: "You're on the list." });
      setEmail("");
    } else {
      setStatus({ kind: "err", message: json.error ?? "Something went wrong." });
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Newsletter</p>
      <p className="mt-3 text-sm text-slate-600 max-w-[28ch]">
        Product updates and safety tips, occasionally.
      </p>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="h-9"
          aria-label="Email address"
        />
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "…" : "Subscribe"}
        </Button>
      </form>
      {status && (
        <p className={status.kind === "ok" ? "mt-2 text-xs text-status-success" : "mt-2 text-xs text-status-critical"}>
          {status.message}
        </p>
      )}
    </div>
  );
}
