import { LogoMark } from "@/components/brand/logo";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid lg:grid-cols-2 min-h-[calc(100vh-4rem)]">
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-secondary text-white p-12">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.15]"
          viewBox="0 0 600 800"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <path
            d="M -50 700 C 100 700, 150 500, 300 480 S 500 300, 450 100 S 600 -50, 700 -80"
            stroke="#22A06B"
            strokeWidth="2"
            strokeDasharray="1200"
            strokeDashoffset="1200"
            className="animate-dash-draw"
          />
        </svg>
        <div className="relative">
          <LogoMark className="h-8 w-8" />
        </div>
        <div className="relative">
          <p className="text-xs font-mono uppercase tracking-wide text-status-success">Live monitoring, 24/7</p>
          <p className="mt-4 text-2xl font-display font-semibold leading-snug max-w-[18ch]">
            One signal is all it takes to be seen.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-secondary">{title}</h1>
          <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
