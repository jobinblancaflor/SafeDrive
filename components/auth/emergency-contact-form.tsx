"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardDescription } from "@/components/ui/card";

type Contact = { id: string; fullname: string; phone: string };

type Props =
  | { mode: "self"; initial: Contact[] }
  | { mode: "admin"; ownerId: string; initial: Contact[] };

export function EmergencyContactForm(props: Props) {
  const router = useRouter();
  const isAdmin = props.mode === "admin";
  const [contacts, setContacts] = useState<Contact[]>(props.initial);
  const [fullname, setFullname] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setLoading(true);
    setError(null);
    const url = isAdmin ? "/api/admin/emergency-contact" : "/api/emergency-contact";
    const body = isAdmin
      ? { user_id: props.ownerId, fullname, phone }
      : { fullname, phone };

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(json.error || "Failed to add");
      return;
    }
    setContacts((c) => [json.data, ...c]);
    setFullname("");
    setPhone("");
    router.refresh();
  }

  async function remove(id: string) {
    const url = isAdmin
      ? `/api/admin/emergency-contact/${id}`
      : `/api/emergency-contact/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok) {
      setContacts((c) => c.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {contacts.length === 0 && <CardDescription>No contacts yet.</CardDescription>}
      <ul className="divide-y">
        {contacts.map((c) => (
          <li key={c.id} className="py-2 flex items-center justify-between">
            <div>
              <p className="font-medium">{c.fullname}</p>
              <p className="text-sm text-slate-500">{c.phone}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => remove(c.id)}>Remove</Button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ec-name">Name</Label>
          <Input id="ec-name" value={fullname} onChange={(e) => setFullname(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ec-phone">Phone</Label>
          <Input id="ec-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <Button onClick={add} disabled={loading || !fullname || !phone}>
        {loading ? "Adding…" : "Add contact"}
      </Button>
    </div>
  );
}