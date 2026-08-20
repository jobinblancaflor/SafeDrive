import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-slate-200/80">
        <div className="max-w-6xl mx-auto flex items-center px-6 h-16">
          <Link href="/" aria-label="Secure Signal home">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center">
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <p className="font-mono text-sm text-primary">404</p>
          <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-secondary">
            This route went off the map
          </h1>
          <p className="text-slate-500 mt-2">
            The page you&apos;re looking for doesn&apos;t exist, or has moved.
          </p>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-md bg-secondary px-6 mt-8 text-sm font-medium text-white hover:opacity-90 transition-colors"
          >
            Back to safety
          </Link>
        </div>
      </main>
    </div>
  );
}
