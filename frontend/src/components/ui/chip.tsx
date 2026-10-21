"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, className, type = "button", children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-touch min-w-touch items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        selected
          ? "border-accent bg-accent-tint text-accent"
          : "border-border bg-white text-muted hover:bg-page hover:text-ink",
        className,
      )}
      {...props}
    >
      {selected ? (
        <span aria-hidden className="text-xs leading-none">
          ✓
        </span>
      ) : null}
      {children}
    </button>
  );
});
