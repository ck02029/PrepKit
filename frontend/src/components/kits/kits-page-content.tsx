"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { KitsListSkeleton } from "@/components/kits/kits-list-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { deleteKit, fetchKits, retryKit } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type KitFilter = "all" | "ready" | "generating" | "failed";
const statusStyles = {
  ready: "bg-[#e3f2f0] text-[#0f6b63]",
  needs_review: "bg-[#fff3d7] text-[#76500b]",
  generating: "bg-[#fff3d7] text-[#76500b]",
  failed: "bg-[#fce9e6] text-[#8a1f14]",
};

export function KitsPageContent({ duplicate = false }: { duplicate?: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<KitFilter>("all");
  const [showDuplicate, setShowDuplicate] = useState(duplicate);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.kits,
    queryFn: fetchKits,
  });
  const removeMutation = useMutation({ mutationFn: deleteKit, onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.kits }) });
  const retryMutation = useMutation({ mutationFn: retryKit, onSuccess: (kit) => { void queryClient.invalidateQueries({ queryKey: queryKeys.kits }); router.push(`/kits/${kit.id}?generating=1`); } });
  const kits = data ?? [];
  const counts: Record<KitFilter, number> = {
    all: kits.length,
    ready: kits.filter((kit) => (kit.status ?? "ready") === "ready").length,
    generating: kits.filter((kit) => kit.status === "generating").length,
    failed: kits.filter((kit) => kit.status === "failed").length,
  };
  const visibleKits = kits.filter((kit) => {
    const matchesSearch = `${kit.title} ${kit.company} ${kit.role}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (filter === "all" || (kit.status ?? "ready") === filter);
  });

  return (
    <div className="flex flex-col gap-6">
      {showDuplicate ? <div role="status" aria-live="polite" className="flex items-start justify-between gap-4 border-l-4 border-accent bg-accent-tint px-4 py-3 text-sm text-ink"><span>You already had a kit for this role, so we opened it.</span><button aria-label="Dismiss notice" onClick={() => setShowDuplicate(false)}>×</button></div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink md:text-3xl">
            Interview kits
          </h1>
          <p className="mt-1 text-sm text-muted">
            One place for checklists, questions, and notes per opportunity.
          </p>
        </div>
        <LinkButton href="/new">New kit</LinkButton>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search kits" aria-label="Search kits" className="h-11 w-full max-w-sm rounded-lg border border-border bg-white px-3 text-sm" />
        <div role="group" aria-label="Filter kits" className="flex flex-wrap gap-2">{(["all", "ready", "generating", "failed"] as const).map((value) => <Chip key={value} selected={filter === value} onClick={() => setFilter(value)}>{value[0].toUpperCase() + value.slice(1)} <span className="font-mono text-xs">{counts[value]}</span></Chip>)}</div>
      </div>

      {isLoading ? <KitsListSkeleton /> : null}

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : null}

      {!isLoading && !isError && kits.length === 0 ? (
        <EmptyState
          title="No kits yet"
          description="Create a kit for each company or loop you are preparing for."
          action={<LinkButton href="/new">New kit</LinkButton>}
        />
      ) : null}

      {!isLoading && !isError && kits.length > 0 && visibleKits.length === 0 ? <EmptyState title="No matching kits" description="Try a different search or reset the status filter." action={<Button variant="secondary" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</Button>} /> : null}

      {!isLoading && !isError && visibleKits.length > 0 ? (
        <ul className="divide-y divide-border border-y border-border">
          {visibleKits.map((kit) => {
            const status = kit.status ?? "ready";
            return <li key={kit.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><Link href={`/kits/${kit.id}`} className="font-semibold text-ink hover:text-accent">{kit.title}</Link><p className="mt-1 truncate text-sm text-muted">{kit.company} · {kit.role}</p></div>
              <div className="flex flex-wrap items-center gap-2"><span className={`rounded px-2.5 py-1 text-xs font-medium ${statusStyles[status]}`}>{status === "needs_review" ? "Needs review" : status[0].toUpperCase() + status.slice(1)}</span>{status === "failed" ? <Button variant="secondary" onClick={() => retryMutation.mutate(kit.id)}>Try again</Button> : null}<LinkButton variant="secondary" href={`/kits/${kit.id}${status === "generating" ? "?generating=1" : ""}`}>Open</LinkButton><Button variant="ghost" aria-label={`Delete ${kit.title}`} onClick={() => { if (window.confirm(`Delete “${kit.title}”?`)) removeMutation.mutate(kit.id); }}>Delete</Button></div>
            </li>;
          })}
        </ul>
      ) : null}
    </div>
  );
}
