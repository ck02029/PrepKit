"use client";

import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 600;

export function useDebouncedSave<T>(
  value: T,
  onSave: (value: T) => void,
  isEqual: (a: T, b: T) => boolean = Object.is,
): void {
  const isFirst = useRef(true);
  const lastSaved = useRef(value);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      lastSaved.current = value;
      return;
    }

    if (isEqual(value, lastSaved.current)) {
      return;
    }

    const timer = window.setTimeout(() => {
      lastSaved.current = value;
      onSave(value);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [value, onSave, isEqual]);
}
