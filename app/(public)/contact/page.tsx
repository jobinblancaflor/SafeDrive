import { ContactForm } from "@/components/auth/contact-form";

export default function ContactPage() {
  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Contact</p>
      <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-secondary">
        Tell us what you need
      </h1>
      <p className="text-sm text-slate-500 mt-2">
        We read every message. For account or safety issues, include your registered email.
      </p>
      <ContactForm />
    </div>
  );
}
