import { ResetForm } from "@/components/auth/reset-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function ResetPasswordPage() {
  return (
    <AuthShell eyebrow="Account recovery" title="Set new password" subtitle="Choose a strong password.">
      <ResetForm />
    </AuthShell>
  );
}
