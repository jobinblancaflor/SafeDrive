import Image from "next/image";
import { cn } from "@/lib/utils";
import logoMark from "@/public/logo-mark.png";

/**
 * Secure Signal's mark: concentric red signal rings around a navy core —
 * the official logo artwork. Used everywhere the brand appears so the
 * marketing site and the dashboard read as one product.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={logoMark}
      alt="Secure Signal"
      className={cn("h-6 w-6 select-none", className)}
    />
  );
}

export function Wordmark({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className={dark ? "text-white" : "text-secondary"}>
        Secure Signal
      </span>
    </span>
  );
}
