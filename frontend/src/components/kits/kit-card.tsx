import { EntityId } from "@/components/ui/entity-id";
import type { Kit } from "@/lib/types";
import Link from "next/link";

type KitCardProps = {
  kit: Kit;
};

function formatDate(iso: string | null): string {
  if (!iso) return "Date TBD";
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KitCard({ kit }: KitCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md md:p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-ink md:text-lg">
            <Link
              href={`/kits/${kit.id}`}
              className="inline-flex min-h-touch items-center rounded-md hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {kit.title}
            </Link>
          </h2>
          <EntityId id={kit.id} />
        </div>
        <p className="text-sm text-muted">
          {kit.company} · {kit.role}
        </p>
        <p className="text-sm text-ink">
          Interview:{" "}
          <span
            className={
              kit.interviewDate ? "text-ink" : "rounded bg-warning-bg px-1.5 py-0.5 text-warning-text"
            }
          >
            {formatDate(kit.interviewDate)}
          </span>
        </p>
      </div>
    </article>
  );
}
