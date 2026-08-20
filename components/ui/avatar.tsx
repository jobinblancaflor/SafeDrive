"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

export function Avatar({
  src,
  alt,
  size = 40,
  className,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(src) && !errored;

  return (
    <div
      className={cn(
        "grid flex-none place-items-center overflow-hidden rounded-full bg-slate-100 text-slate-500",
        className,
      )}
      style={{ height: size, width: size }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote, user-supplied avatar URLs; next/image would require allowlisting every rider's storage host
        <img
          src={src as string}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <User className="h-1/2 w-1/2" aria-hidden />
      )}
    </div>
  );
}
