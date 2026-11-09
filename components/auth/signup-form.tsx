"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const router = useRouter();
  const [fullname, setFullname] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { fullname, phone },
        emailRedirectTo: `${window.location.origin}/email-confirmed`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // With email confirmation enabled, signUp returns no session until the
    // user clicks the emailed link — pushing to "/" would just bounce them
    // to /login with no explanation.
    if (!data.session) {
      setCheckEmail(true);
      return;
    }
    router.push("/");
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="mt-8 space-y-2" role="status">
        <p className="text-sm font-medium text-slate-900">Check your email</p>
        <p className="text-sm text-slate-600">
          We sent a confirmation link to <span className="font-medium">{email}</span>. Click it to
          activate your account, then sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1">
        <Label htmlFor="fullname">Full name</Label>
        <Input id="fullname" required value={fullname} onChange={(e) => setFullname(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating…" : "Create account"}
      </Button>
      <div className="relative py-1 text-center text-xs uppercase text-slate-400">
        <span className="relative bg-white px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200" />
      </div>
      <GoogleAuthButton />
    </form>
  );
}
