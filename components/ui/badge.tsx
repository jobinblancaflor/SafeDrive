import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-white",
        secondary: "border-transparent bg-surface-variant text-text-primary",
        destructive: "border-transparent bg-status-critical/10 text-status-critical",
        outline: "border-outline text-text-secondary",
        success: "border-transparent bg-status-success/10 text-status-success",
        warning: "border-transparent bg-status-warning/10 text-status-warning",
        info: "border-transparent bg-status-info/10 text-status-info",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
