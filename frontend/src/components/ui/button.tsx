"use client";

import { cn } from "@/lib/cn";
import Link from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent/90 border border-transparent",
  secondary:
    "bg-white text-ink border border-border hover:bg-page",
  danger: "bg-danger text-white hover:bg-danger/90 border border-transparent",
  ghost:
    "bg-transparent text-ink border border-transparent hover:bg-page",
};

const baseClasses =
  "inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", className, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(baseClasses, variantClasses[variant], className)}
        {...props}
      />
    );
  },
);

export type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  children: ReactNode;
};

export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  function LinkButton(
    { href, variant = "primary", className, children, ...props },
    ref,
  ) {
    return (
      <Link
        ref={ref}
        href={href}
        className={cn(baseClasses, variantClasses[variant], className)}
        {...props}
      >
        {children}
      </Link>
    );
  },
);
