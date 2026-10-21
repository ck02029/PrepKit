import { cn } from "@/lib/cn";
import { forwardRef, type HTMLAttributes } from "react";

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("animate-pulse rounded-md bg-border/70", className)}
        aria-hidden
        aria-busy="true"
        {...props}
      />
    );
  },
);
