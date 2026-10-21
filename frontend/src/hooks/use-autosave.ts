"use client";

import { patchKitData } from "@/lib/api";
import type { KitData } from "@/lib/schema";
import { saveErrorState } from "@/lib/save-error-state";
import { queryKeys } from "@/lib/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

type SaveState = "saved" | "saving" | "error" | "conflict";

export function useAutosave(itemId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<SaveState>("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<KitData | null>(null);
  const version = useRef(0);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function save(next: KitData) {
    latest.current = next;
    const key = queryKeys.kitData(itemId);
    const current = queryClient.getQueryData<{ data: KitData; version: number }>(key);
    queryClient.setQueryData(key, { data: next, version: current?.version ?? version.current });
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void patchKitData(itemId, next, version.current).then((result) => {
        version.current = result.version;
        queryClient.setQueryData(key, result);
        setState("saved");
      }).catch((error: unknown) => {
        setState(saveErrorState(error));
      });
    }, 600);
  }

  async function retry(): Promise<boolean> {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setState("saving");
    try {
      if (!latest.current) return false;
      const result = await patchKitData(itemId, latest.current, version.current);
      version.current = result.version;
      queryClient.setQueryData(queryKeys.kitData(itemId), result);
      setState("saved");
      return true;
    } catch (error) {
      setState(saveErrorState(error));
      return false;
    }
  }

  const setVersion = useCallback((next: number) => { version.current = next; }, []);
  return { state, save, retry, setVersion };
}
