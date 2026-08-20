import Link from "next/link";
import {
  MapPin,
  Users,
  ShieldCheck,
  Radio,
  History,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";

export function LandingPage() {
  return (
    <div>
      <Hero />
      <HowItWorks />
      <Features />
      <TeamSplit />
      <ClosingCta />
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-secondary text-white">
      {/* faint route line traveling through the hero — the drive the product watches over */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
        viewBox="0 0 1200 700"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path
          d="M -50 550 C 200 550, 250 300, 480 320 S 760 500, 980 260 S 1150 60, 1300 90"
          stroke="#22A06B"
          strokeWidth="2"
          strokeDasharray="1400"
          strokeDashoffset="1400"
          className="animate-dash-draw"
        />
      </svg>

      <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 md:pt-28 md:pb-36 grid md:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-primary font-mono tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse" />
            LIVE MONITORING, 24/7
          </p>
          <h1 className="mt-6 text-4xl md:text-5xl font-display font-semibold tracking-tight leading-[1.08] text-balance">
            Help finds you<br />before you have to ask twice.
          </h1>
          <p className="mt-5 text-lg text-white/70 max-w-[46ch] text-balance">
            Secure Signal turns one signal from the road into a live location, a notified
            contact, and a dispatcher watching — in the time it takes to say
            &ldquo;I need help.&rdquo;
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
            >
              Create an account <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 px-6 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              Sign in to your dashboard
            </Link>
          </div>
        </div>

        <SignalPreviewCard />
      </div>
    </section>
  );
}

/** The signature element: a live preview of the exact card staff see in the
 * real incident monitor, complete with the radar-ping animation the map uses
 * for an active location. */
function SignalPreviewCard() {
  return (
    <div className="relative mx-auto w-full max-w-sm animate-float-slow">
      <div className="rounded-xl border border-white/10 bg-secondary/80 p-5 shadow-2xl shadow-black/40 backdrop-blur">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-white">Maria Dela Cruz</p>
            <p className="text-xs text-white/50 font-mono mt-0.5">+63 917 •••  •• 41</p>
          </div>
          <span className="rounded-full bg-primary-container/10 border border-primary/40 px-2.5 py-0.5 text-[11px] font-mono font-medium text-primary">
            received
          </span>
        </div>

        <div className="mt-5 relative h-40 rounded-lg bg-secondary border border-white/10 overflow-hidden">
          <div className="absolute inset-0" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="absolute inset-0 -m-8 rounded-full border border-primary animate-radar-ping" />
            <span className="absolute inset-0 -m-8 rounded-full border border-primary animate-radar-ping [animation-delay:0.8s]" />
            <MapPin className="h-6 w-6 text-primary relative" fill="#FF594D" aria-hidden />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono text-white/60">
          <div>
            <dt className="text-white/35">lat, lng</dt>
            <dd className="text-white/80">14.5995, 120.9842</dd>
          </div>
          <div>
            <dt className="text-white/35">reported</dt>
            <dd className="text-white/80">00:00:07 ago</dd>
          </div>
        </dl>
      </div>
      <div className="absolute -bottom-4 -left-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
        <LogoMark className="h-5 w-5" />
      </div>
    </div>
  );
}

const steps = [
  {
    n: "01",
    title: "Trigger",
    body: "The rider's device sends a single SOS signal — no forms, no menus, one action.",
  },
  {
    n: "02",
    title: "Relay",
    body: "The signal lands on the monitoring dashboard instantly, with a live location and incident type.",
  },
  {
    n: "03",
    title: "Response",
    body: "Admin or authority staff acknowledge the incident, watch it move in real time, and can stop the alert once it's resolved.",
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-white">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">How it works</p>
          <h2 className="mt-2 text-3xl font-display font-semibold tracking-tight text-secondary">
            Three steps, in the order they happen
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
          {steps.map((s) => (
            <div key={s.n} className="bg-white p-8">
              <span className="font-mono text-sm text-primary">{s.n}</span>
              <h3 className="mt-3 text-lg font-display font-semibold text-secondary">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: MapPin,
    title: "Live location tracking",
    body: "Every active incident streams a breadcrumb trail to the map in real time, not just a single point.",
  },
  {
    icon: Users,
    title: "Emergency contacts",
    body: "Riders keep a personal contact list on file, ready the moment an incident is reported.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based dashboards",
    body: "Admins manage riders and billing; authority staff see only what they need to respond.",
  },
  {
    icon: Radio,
    title: "Instant device ping",
    body: "Reach a specific device directly and confirm it received the message.",
  },
  {
    icon: History,
    title: "Full incident history",
    body: "Every status change is logged — who acted, what changed, and when.",
  },
  {
    icon: CreditCard,
    title: "Billing, built in",
    body: "Subscriptions and payment status live next to the rider record, not in a separate tool.",
  },
];

function Features() {
  return (
    <section id="features" className="bg-background border-y border-slate-200">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Features</p>
          <h2 className="mt-2 text-3xl font-display font-semibold tracking-tight text-secondary">
            Everything a response desk needs, nothing it doesn&rsquo;t
          </h2>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <f.icon className="h-5 w-5 text-primary" aria-hidden />
              <h3 className="mt-4 font-display font-semibold text-secondary">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSplit() {
  return (
    <section className="bg-white">
      <div className="max-w-6xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">For admins</p>
          <h3 className="mt-2 text-2xl font-display font-semibold text-secondary">Run the whole account</h3>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            Manage riders, review subscriptions, and configure how the account works —
            all from one dashboard.
          </p>
        </div>
        <div className="rounded-xl border border-secondary bg-secondary text-white p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">For authority staff</p>
          <h3 className="mt-2 text-2xl font-display font-semibold">Watch, respond, resolve</h3>
          <p className="mt-3 text-sm text-white/70 leading-relaxed">
            A focused view of incidents and live locations — built for the moment
            someone needs a fast answer.
          </p>
        </div>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="bg-secondary text-white">
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-display font-semibold tracking-tight text-balance">
          Set up your response team today
        </h2>
        <p className="mt-3 text-white/60 max-w-md mx-auto">
          Create an admin account and invite your authority staff in minutes.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Create an account <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/faq"
            className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 px-6 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Read the FAQ
          </Link>
        </div>
      </div>
    </section>
  );
}
