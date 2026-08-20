import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignupPage() {
  return (
    <AuthShell eyebrow="Get started" title="Create account" subtitle="Sign up for a Secure Signal account.">
      <SignupForm />
      <p className="text-sm text-slate-600 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-secondary underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
