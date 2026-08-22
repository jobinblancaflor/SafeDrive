"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const json = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!res.ok || !json.reply) {
        setError(json.error ?? "Something went wrong.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply as string }]);
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {open && (
        <div className="mb-3 flex h-[480px] w-[340px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b bg-secondary px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Secure Signal Assistant</p>
              <p className="text-xs text-white/70">Ask about how the app works</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div ref={listRef} className="flex-1 space-y-2 overflow-auto px-3 py-3">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500">
                Hi! Ask me anything about Secure Signal — how SOS triggers work, live tracking, or your account.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-800",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                </div>
              </div>
            )}
            {error && <p className="text-xs text-status-critical">{error}</p>}
          </div>
          <form onSubmit={onSend} className="flex items-center gap-2 border-t p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            />
            <button
              type="submit"
              disabled={pending || !draft.trim()}
              aria-label="Send"
              className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-md bg-slate-900 text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-white shadow-lg hover:bg-secondary/90"
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
      </button>
    </div>
  );
}
