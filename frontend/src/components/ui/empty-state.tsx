import { cn } from "@/lib/cn";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: string;
  action?: ReactNode;
};

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  function EmptyState(
    { title, description, action, className, ...props },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center",
          className,
        )}
        role="status"
        aria-live="polite"
        {...props}
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-2 max-w-md text-sm text-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    );
  },
);
