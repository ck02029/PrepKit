"use client";

import { cn } from "@/lib/cn";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastTone = "inverse" | "surface";

export type ToastUndo = {
  label?: string;
  onUndo: () => void;
};

export type ToastInput = {
  id?: string;
  message: string;
  tone?: ToastTone;
  undo?: ToastUndo;
  durationMs?: number;
};

type ToastRecord = ToastInput & { id: string };

type ToastContextValue = {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = toast.id ?? `toast_${Date.now()}`;
      const record: ToastRecord = { ...toast, id };
      setToasts((current) => [...current, record]);

      const duration = toast.durationMs ?? (toast.undo ? 8000 : 4000);
      window.setTimeout(() => dismiss(id), duration);

      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <ToastViewport toasts={toasts} onDismiss={dismiss} />,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

type ToastViewportProps = {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
};

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => (
        <ToastBar key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

type ToastBarProps = {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
};

export const ToastBar = forwardRef<HTMLDivElement, ToastBarProps>(
  function ToastBar({ toast, onDismiss }, ref) {
    const tone = toast.tone ?? (toast.undo ? "inverse" : "surface");

    return (
      <div
        ref={ref}
        role="status"
        className={cn(
          "pointer-events-auto flex w-full max-w-md items-center justify-between gap-4 rounded-lg px-4 py-3 text-sm shadow-overlay sm:w-auto",
          tone === "inverse"
            ? "bg-ink text-white"
            : "border border-border bg-white text-ink",
        )}
      >
        <p className="flex-1">{toast.message}</p>
        {toast.undo ? (
          <button
            type="button"
            className={cn(
              "inline-flex min-h-touch shrink-0 items-center rounded-md px-2 font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              tone === "inverse"
                ? "text-accent-tint focus-visible:outline-accent-tint"
                : "text-accent focus-visible:outline-accent",
            )}
            onClick={() => {
              toast.undo?.onUndo();
              onDismiss(toast.id);
            }}
          >
            {toast.undo.label ?? "Undo"}
          </button>
        ) : null}
      </div>
    );
  },
);

export type ToastProps = HTMLAttributes<HTMLDivElement> & {
  message: string;
  tone?: ToastTone;
  undo?: ToastUndo;
};

/** Presentational toast for the design gallery (not portaled). */
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { message, tone = "inverse", undo, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full max-w-md items-center justify-between gap-4 rounded-lg px-4 py-3 text-sm shadow-overlay",
        tone === "inverse"
          ? "bg-ink text-white"
          : "border border-border bg-white text-ink",
        className,
      )}
      {...props}
    >
      <p className="flex-1">{message}</p>
      {undo ? (
        <button
          type="button"
          className={cn(
            "inline-flex min-h-touch shrink-0 items-center px-2 font-medium underline-offset-2 hover:underline",
            tone === "inverse" ? "text-accent-tint" : "text-accent",
          )}
          onClick={undo.onUndo}
        >
          {undo.label ?? "Undo"}
        </button>
      ) : null}
    </div>
  );
});
