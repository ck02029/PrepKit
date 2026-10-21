"use client";

import { cn } from "@/lib/cn";
import {
  forwardRef,
  useId,
  useState,
  type ChangeEvent,
  type TextareaHTMLAttributes,
} from "react";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  showCount?: boolean;
};

function getLength(
  value: TextareaHTMLAttributes<HTMLTextAreaElement>["value"],
  fallback: number,
): number {
  if (typeof value === "string") {
    return value.length;
  }
  if (Array.isArray(value)) {
    return value.join("").length;
  }
  return fallback;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      className,
      maxLength,
      showCount = true,
      value,
      defaultValue,
      onChange,
      id: idProp,
      rows = 4,
      ...props
    },
    ref,
  ) {
    const autoId = useId();
    const id = idProp ?? autoId;
    const counterId = `${id}-counter`;

    const [uncontrolledLength, setUncontrolledLength] = useState(() => {
      if (typeof defaultValue === "string") {
        return defaultValue.length;
      }
      return 0;
    });

    const length =
      value !== undefined
        ? getLength(value, 0)
        : uncontrolledLength;

    function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
      if (value === undefined) {
        setUncontrolledLength(event.target.value.length);
      }
      onChange?.(event);
    }

    const shouldShowCount = showCount && maxLength !== undefined;

    return (
      <div className="flex w-full flex-col gap-1">
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          aria-describedby={shouldShowCount ? counterId : undefined}
          className={cn(
            "min-h-[6rem] w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {shouldShowCount ? (
          <p
            id={counterId}
            className={cn(
              "text-right font-mono text-xs tabular-nums",
              length >= maxLength! ? "text-danger" : "text-muted",
            )}
            aria-live="polite"
          >
            {length} / {maxLength}
          </p>
        ) : null}
      </div>
    );
  },
);
