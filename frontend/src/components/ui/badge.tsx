import { cn } from "@/lib/cn";
import { forwardRef, type HTMLAttributes } from "react";

export type BadgeVariant =
  | "accent"
  | "muted"
  | "warning"
  | "ink"
  | "nice"
  | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  accent: "bg-accent-tint text-accent border-accent/20",
  muted: "bg-page text-muted border-border",
  warning: "bg-warning-bg text-warning-text border-warning-border",
  ink: "bg-ink text-white border-transparent",
  nice: "bg-nice-bg text-nice-text border-border",
  outline: "bg-white text-ink border-border",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "accent", className, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
});
