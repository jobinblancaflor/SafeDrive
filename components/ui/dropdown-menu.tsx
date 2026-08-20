"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DropdownContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement>;
  menuRef: React.RefObject<HTMLDivElement>;
};

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

export function DropdownMenu({
  trigger,
  children,
  align = "end",
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    triggerRef: React.RefCallback<HTMLButtonElement>;
  }) => React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const setTriggerRef = React.useCallback((el: HTMLButtonElement | null) => {
    triggerRef.current = el;
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(ev: MouseEvent) {
      const t = ev.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onEsc(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen, triggerRef, menuRef }}>
      <div className="relative inline-block">
        {trigger({ open, toggle: () => setOpen(!open), triggerRef: setTriggerRef })}
        {open && (
          <div
            ref={menuRef}
            role="menu"
            className={cn(
              "absolute z-30 mt-1 min-w-[180px] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {children}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  );
}

export function DropdownMenuItem({
  onSelect,
  disabled,
  destructive,
  children,
}: {
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        ctx?.setOpen(false);
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
        disabled
          ? "cursor-not-allowed text-slate-300"
          : destructive
            ? "text-status-critical hover:bg-status-critical/10"
            : "text-slate-700 hover:bg-slate-100",
      )}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-slate-200" />;
}
