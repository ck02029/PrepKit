"use client";

import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/cn";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("Dialog components must be used within Dialog");
  }
  return ctx;
}

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <DialogContext.Provider
      value={{ open, setOpen: onOpenChange, titleId, descriptionId }}
    >
      {children}
    </DialogContext.Provider>
  );
}

export type DialogContentProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  function DialogContent({ className, children, ...props }, ref) {
    const { open, setOpen, titleId, descriptionId } = useDialogContext();
    const panelRef = useRef<HTMLDivElement>(null);
    const mergedRef = (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    useFocusTrap(open, panelRef);

    useEffect(() => {
      if (!open) {
        return;
      }
      function onKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
      }
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, setOpen]);

    if (!open || typeof document === "undefined") {
      return null;
    }

    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            setOpen(false);
          }
        }}
      >
        <div
          ref={mergedRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={cn(
            "w-full max-w-lg rounded-t-xl border border-border bg-white p-6 shadow-overlay sm:rounded-xl",
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </div>,
      document.body,
    );
  },
);

export const DialogHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DialogHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
});

export const DialogTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(function DialogTitle({ className, ...props }, ref) {
  const { titleId } = useDialogContext();
  return (
    <h2
      ref={ref}
      id={titleId}
      className={cn("text-lg font-semibold text-ink", className)}
      {...props}
    />
  );
});

export const DialogDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function DialogDescription({ className, ...props }, ref) {
  const { descriptionId } = useDialogContext();
  return (
    <p
      ref={ref}
      id={descriptionId}
      className={cn("text-sm text-muted", className)}
      {...props}
    />
  );
});

export const DialogFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DialogFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
});
