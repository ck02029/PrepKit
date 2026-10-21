"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { forwardRef, type HTMLAttributes } from "react";

export type ErrorStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
  function ErrorState(
    {
      title = "Something went wrong",
      message = "We could not load this screen. Try again.",
      onRetry,
      retryLabel = "Try again",
      className,
      ...props
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl border border-danger/25 bg-danger/[0.06] px-6 py-8 text-center",
          className,
        )}
        role="alert"
        aria-live="assertive"
        {...props}
      >
        <h2 className="text-lg font-semibold text-danger">{title}</h2>
        <p className="mt-2 text-sm text-danger/90">{message}</p>
        {onRetry ? (
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={onRetry}>
              {retryLabel}
            </Button>
          </div>
        ) : null}
      </div>
    );
  },
);
