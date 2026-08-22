"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export type IncidentMessage = {
  id: string;
  incident_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export function IncidentMessages({
  incidentId,
  currentUserId,
  initialMessages,
}: {
  incidentId: string;
  currentUserId: string;
  initialMessages: IncidentMessage[];
}) {
  const [messages, setMessages] = useState<IncidentMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`incident-messages-${incidentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "incident_messages",
          filter: `incident_id=eq.${incidentId}`,
        },
        (payload) => {
          const row = payload.new as IncidentMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [incidentId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setDraft("");
    const supabase = createClient();
    const { error } = await supabase.from("incident_messages").insert({
      incident_id: incidentId,
      sender_id: currentUserId,
      body,
    });
    setSending(false);
    if (error) {
      console.error("send message failed:", error);
      setDraft(body);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Messages</p>
        <p className="text-xs text-slate-500">Talk directly with the rider</p>
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500">No messages yet.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={mine ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  mine
                    ? "max-w-[85%] rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
                    : "max-w-[85%] rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800"
                }
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={mine ? "mt-1 text-[10px] text-slate-300" : "mt-1 text-[10px] text-slate-400"}>
                  {formatDate(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={onSend} className="flex items-center gap-2 border-t p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        />
        <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </div>
  );
}
