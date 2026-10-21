"use client";

import { Field, TextArea } from "@/components/ui/field";
import { useDebouncedSave } from "@/hooks/use-debounced-save";
import { saveKit } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

type KitNotesEditorProps = {
  kitId: string;
  initialNotes: string;
};

export function KitNotesEditor({ kitId, initialNotes }: KitNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const queryClient = useQueryClient();

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const mutation = useMutation({
    mutationFn: (value: string) => saveKit(kitId, { notes: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.kit(kitId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.kits });
    },
  });
  const mutate = mutation.mutate;

  const onSave = useCallback(
    (value: string) => {
      mutate(value);
    },
    [mutate],
  );

  useDebouncedSave(notes, onSave);

  return (
    <Field
      id="kit-notes"
      label="Prep notes"
      hint={
        mutation.isPending
          ? "Saving…"
          : mutation.isError
            ? "Could not save. Keep editing to retry."
            : "Changes save automatically."
      }
    >
      <TextArea
        id="kit-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Research topics, interviewer names, logistics…"
        rows={5}
        aria-invalid={mutation.isError}
      />
    </Field>
  );
}
