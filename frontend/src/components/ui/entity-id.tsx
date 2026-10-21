type EntityIdProps = {
  id: string;
  label?: string;
};

export function EntityId({ id, label = "ID" }: EntityIdProps) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="sr-only">{label}</span>
      <span aria-hidden className="font-medium uppercase tracking-wide">
        {label}
      </span>
      <code className="font-mono text-[11px] text-ink">{id}</code>
    </span>
  );
}
