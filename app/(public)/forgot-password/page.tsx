import Link from "next/link";
import { ForgotForm } from "@/components/auth/forgot-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ForgotPasswordPage() {
  return (
    <AuthShell eyebrow="Account recovery" title="Reset password" subtitle="We'll email you a reset link.">
      <ForgotForm />
      <p className="text-sm text-slate-600 mt-6">
        <Link href="/login" className="hover:text-secondary hover:underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
