"use client";

import { useEffect, useRef, useState } from "react";
import type { Origin } from "@/lib/schema";

const labels: Record<Origin, string> = { generated: "Generated", edited: "Edited", pinned: "Pinned", user: "Yours" };

export function OriginBadge({ origin }: { origin: Origin }) {
  return <span className="rounded border border-border px-2 py-0.5 text-xs text-muted">{labels[origin]}</span>;
}

export function InlineEdit({ value, onCommit, multiline = false, className = "", label = "Edit text" }: { value: string; onCommit: (value: string) => void; multiline?: boolean; className?: string; label?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const area = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (editing && area.current) {
      area.current.style.height = "auto";
      area.current.style.height = `${area.current.scrollHeight}px`;
      area.current.focus();
    } else if (restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [editing, draft]);
  function commit() {
    if (draft !== value) onCommit(draft);
    setEditing(false);
  }
  if (!editing) return <button ref={trigger} type="button" aria-label={`${label}: ${value || "empty"}`} onClick={() => setEditing(true)} className={`text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}>{value || <span className="italic text-muted">Add text…</span>}</button>;
  return <textarea ref={area} aria-label={`${label} editor`} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => {
    if (event.key === "Escape") { restoreFocus.current = true; setDraft(value); setEditing(false); }
    if (event.key === "Enter" && (!multiline || !event.shiftKey)) { event.preventDefault(); restoreFocus.current = true; event.currentTarget.blur(); }
  }} className={`w-full resize-none rounded border border-accent bg-white p-2 text-sm text-ink ${className}`} rows={1} />;
}
