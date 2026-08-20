export const metadata = { title: "FAQ — Secure Signal" };

const FAQ = [
  { q: "How do I sign up?", a: "Click 'Create account' on the sign-in page and provide your name, phone, and email." },
  { q: "What is Secure Signal?", a: "A rider safety service — devices notify your emergency contacts and our dispatch team when you need help." },
  { q: "How do I add an emergency contact?", a: "Sign in, go to Settings, and add or edit emergency contacts." },
  { q: "How does Ping work?", a: "Authority or admin staff can ping a device to confirm the rider's location is responding." },
  { q: "How do I cancel my subscription?", a: "Email support@securesignal.local and we'll handle it within 24 hours." },
  { q: "Where is my data stored?", a: "All data is stored in a Supabase-hosted Postgres database in a region you select at signup." },
];

export default function FaqPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Frequently Asked Questions</h1>
      <p className="text-slate-500 mt-2">Answers to the most common questions about Secure Signal.</p>
      <div className="mt-10 space-y-6">
        {FAQ.map((item) => (
          <section key={item.q}>
            <h2 className="font-medium">{item.q}</h2>
            <p className="text-slate-600 mt-1">{item.a}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
