export const metadata = { title: "Terms of Service — Secure Signal" };

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16 prose prose-slate">
      <h1>Terms of Service</h1>
      <p className="text-slate-500">Last updated: today.</p>
      <h2>1. Acceptance</h2>
      <p>By creating a Secure Signal account you agree to these terms.</p>
      <h2>2. Use of the service</h2>
      <p>Secure Signal provides a safety dispatch service connecting a hardware device to authorized personnel. You agree to use the service in good faith and not to abuse it for non-emergency purposes.</p>
      <h2>3. Account</h2>
      <p>You are responsible for your account credentials and for keeping your contact information current.</p>
      <h2>4. Subscriptions</h2>
      <p>Recurring fees are billed via Stripe. Cancel any time; service continues until the end of the current billing period.</p>
      <h2>5. Limitation of liability</h2>
      <p>Secure Signal is a best-effort notification service. We are not a substitute for emergency services.</p>
      <h2>6. Governing law</h2>
      <p>These terms are governed by the laws of your service region.</p>
    </article>
  );
}
