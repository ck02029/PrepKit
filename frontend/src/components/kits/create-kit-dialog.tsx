"use client";

import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { createKit } from "@/lib/api";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

export function CreateKitDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  useFocusTrap(open, dialogRef);

  const mutation = useMutation({
    mutationFn: () =>
      createKit({
        title: title.trim(),
        company: company.trim(),
        role: role.trim(),
      }),
    onSuccess: (kit) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kits });
      setOpen(false);
      setTitle("");
      setCompany("");
      setRole("");
      router.push(`/kits/${kit.id}`);
    },
  });

  const canSubmit =
    title.trim().length > 0 &&
    company.trim().length > 0 &&
    role.trim().length > 0 &&
    !mutation.isPending;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New kit
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 md:items-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${baseId}-title`}
            className="w-full max-w-lg rounded-t-2xl border border-border bg-white p-6 shadow-xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`${baseId}-title`} className="text-lg font-semibold text-ink">
              Create interview kit
            </h2>
            <form
              className="mt-4 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) mutation.mutate();
              }}
            >
              <Field id={`${baseId}-title-field`} label="Title">
                <TextInput
                  id={`${baseId}-title-field`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Senior Frontend — Acme Corp"
                  autoComplete="off"
                />
              </Field>
              <Field id={`${baseId}-company`} label="Company">
                <TextInput
                  id={`${baseId}-company`}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  autoComplete="organization"
                />
              </Field>
              <Field id={`${baseId}-role`} label="Role">
                <TextInput
                  id={`${baseId}-role`}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              {mutation.isError ? (
                <p className="text-sm text-danger" role="alert">
                  Could not create kit. Try again.
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {mutation.isPending ? "Creating…" : "Create kit"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
