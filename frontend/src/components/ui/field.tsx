import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

export function Field({ id, label, hint, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export { Input, Input as TextInput, Textarea, Textarea as TextArea };
