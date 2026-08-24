import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { NewsletterForm } from "@/components/marketing/newsletter-form";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/faq", label: "FAQ" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link href="/" aria-label="Secure Signal home">
            <Wordmark />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-secondary transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-secondary hidden sm:inline">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-white hover:opacity-90 transition-colors"
            >
              Create account
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-background">
        <div className="max-w-6xl mx-auto px-6 py-12 grid gap-10 sm:grid-cols-2 md:grid-cols-5">
          <div className="md:col-span-1">
            <Wordmark />
            <p className="mt-3 text-sm text-slate-500 leading-relaxed max-w-[22ch]">
              A live line to help, from the moment something goes wrong.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              { href: "/#how-it-works", label: "How it works" },
              { href: "/#features", label: "Features" },
              { href: "/login", label: "Dashboard sign in" },
            ]}
          />
          <FooterCol
            title="Support"
            links={[
              { href: "/faq", label: "FAQ" },
              { href: "/contact", label: "Contact us" },
            ]}
          />
          <FooterCol
            title="Legal"
            links={[
              { href: "/terms", label: "Terms" },
              { href: "/privacy", label: "Privacy" },
            ]}
          />
          <NewsletterForm />
        </div>
        <div className="border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-slate-500 flex flex-col sm:flex-row gap-2 justify-between">
            <span>© {new Date().getFullYear()} Secure Signal. All rights reserved.</span>
            <span className="font-mono">Monitored around the clock.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-slate-600 hover:text-secondary transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
