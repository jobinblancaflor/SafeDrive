import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell eyebrow="Welcome back" title="Sign in" subtitle="Sign in to your Secure Signal dashboard.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="text-sm text-slate-600 mt-6">
        New here?{" "}
        <Link href="/signup" className="font-medium text-secondary underline underline-offset-2">
          Create an account
        </Link>
      </p>
      <p className="text-sm text-slate-600 mt-2">
        <Link href="/forgot-password" className="hover:text-secondary hover:underline underline-offset-2">
          Forgot password?
        </Link>
      </p>
    </AuthShell>
  );
}
