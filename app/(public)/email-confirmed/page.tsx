import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Landing page for the signup confirmation email (passed as the signUp()
// emailRedirectTo). Supabase has already confirmed the email by the time it
// redirects here, so this page only reports success — it deliberately does
// not exchange the PKCE code for a session, since that fails whenever the
// link is opened in a different browser than the one used to sign up.
export default function EmailConfirmedPage() {
  return (
    <AuthShell
      eyebrow="Email confirmed"
      title="You're all set"
      subtitle="Your email has been confirmed. You can now sign in to your Secure Signal account."
    >
      <Link href="/login" className={cn(buttonVariants(), "mt-8 w-full")}>
        Sign in
      </Link>
    </AuthShell>
  );
}
