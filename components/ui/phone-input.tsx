"use client";

import * as React from "react";
import intlTelInput, { type Iti } from "intl-tel-input";
import "intl-tel-input/styles";
import { cn } from "@/lib/utils";

export function PhoneInput({
  id,
  value,
  onChange,
  required,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const itiRef = React.useRef<Iti | null>(null);
  const [invalid, setInvalid] = React.useState(false);

  React.useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;

    const iti = intlTelInput(inputEl, {
      initialCountry: "ph",
      separateDialCode: true,
      loadUtils: () => import("intl-tel-input/utils"),
    });
    itiRef.current = iti;

    if (value) inputEl.value = value;

    const emitChange = () => {
      if (!inputEl.value.trim()) {
        onChange("");
        setInvalid(false);
        return;
      }
      const formatted = iti.getNumber() || inputEl.value;
      onChange(formatted);
      setInvalid(iti.isValidNumber() === false);
    };

    inputEl.addEventListener("countrychange", emitChange);
    inputEl.addEventListener("blur", emitChange);
    inputEl.addEventListener("input", emitChange);

    return () => {
      inputEl.removeEventListener("countrychange", emitChange);
      inputEl.removeEventListener("blur", emitChange);
      inputEl.removeEventListener("input", emitChange);
      iti.destroy();
      itiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init on mount; value syncs are one-directional (parent resets clear the field via the effect below)
  }, []);

  // If the parent clears/resets `value` externally (e.g. after a successful
  // submit), reflect that in the underlying input too.
  React.useEffect(() => {
    if (value === "" && inputRef.current) {
      inputRef.current.value = "";
      setInvalid(false);
    }
  }, [value]);

  return (
    <input
      id={id}
      ref={inputRef}
      type="tel"
      required={required}
      className={cn(
        "flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-50",
        invalid ? "border-status-critical" : "border-slate-200",
        className,
      )}
    />
  );
}
