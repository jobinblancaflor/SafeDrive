export const metadata = { title: "Privacy Policy — Secure Signal" };

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p className="text-slate-500">Last updated: today.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account information: name, email, phone.</li>
        <li>Device telemetry: IP, last-seen timestamp, GPS location when an incident is triggered.</li>
        <li>Subscription and billing data (via Stripe — we never see your card).</li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide, maintain, and improve the service, to dispatch help during incidents, and to bill your subscription.</p>
      <h2>Who we share with</h2>
      <p>Authorized dispatchers (admin and authority roles) during an active incident. Stripe for payment processing. Supabase for database hosting.</p>
      <h2>Your rights</h2>
      <p>You can request export or deletion of your data at any time by emailing privacy@securesignal.local.</p>
    </article>
  );
}
