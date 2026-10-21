"use client";

import { ErrorState } from "@/components/ui/error-state";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchKits } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Kit } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

type Profile = { email: string; name: string };

const statusStyles = {
  ready: "bg-[#e3f2f0] text-[#0f6b63]",
  needs_review: "bg-[#fff3d7] text-[#76500b]",
  generating: "bg-[#fff3d7] text-[#76500b]",
  failed: "bg-[#fce9e6] text-[#8a1f14]",
};

export function HomeDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const kitsQuery = useQuery({ queryKey: queryKeys.kits, queryFn: fetchKits });

  useEffect(() => {
    const savedProfile = window.localStorage.getItem("prepkit-profile");
    if (savedProfile) setProfile(JSON.parse(savedProfile) as Profile);
    setProfileLoaded(true);
  }, []);

  if (!profileLoaded || kitsQuery.isLoading) {
    return <div aria-busy="true" aria-label="Loading your home" className="space-y-5"><Skeleton className="h-24 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>;
  }

  if (kitsQuery.isError) return <ErrorState onRetry={() => void kitsQuery.refetch()} />;

  const kits = kitsQuery.data ?? [];
  const recentKits = kits.slice(0, 4);
  const name = profile?.name?.trim() || "there";
  const initial = (profile?.name?.[0] || profile?.email?.[0] || "P").toUpperCase();

  return <div className="flex min-w-0 flex-col gap-8">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div><p className="font-mono text-xs uppercase tracking-[0.12em] text-accent">Your preparation space</p><h1 className="mt-2 text-3xl font-semibold">Welcome, {name}</h1><p className="mt-2 text-sm text-muted">Your interview prep, all in one place.</p></div>
      <LinkButton href="/new">New kit</LinkButton>
    </header>

    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0" aria-labelledby="overview-title">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="overview-title" className="text-lg font-semibold">Kit overview</h2><p className="mt-1 text-sm text-muted">A quick read on your active preparation.</p></div><Link href="/kits" className="text-sm font-medium text-accent underline-offset-4 hover:underline">View all kits</Link></div>
        {recentKits[0] ? <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card" aria-labelledby="next-practice-title"><p className="font-mono text-xs uppercase tracking-[0.12em] text-accent">Your next step</p><h3 id="next-practice-title" className="mt-2 text-xl font-semibold">Continue preparing for {recentKits[0].role}</h3><p className="mt-1 text-sm text-muted">{recentKits[0].company}{recentKits[0].interviewDate ? ` · Interview ${new Date(recentKits[0].interviewDate).toLocaleDateString()}` : " · Add an interview date in your kit when you know it"}</p><LinkButton href={`/kits/${recentKits[0].id}/practice`} className="mt-4">Start practice</LinkButton></section> : null}

        <section className="mt-8" aria-labelledby="recent-title">
          <div className="flex items-center justify-between gap-3"><h2 id="recent-title" className="text-lg font-semibold">Recent kits</h2><Link href="/kits" className="text-sm text-muted underline-offset-4 hover:underline">See all</Link></div>
          {recentKits.length ? <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-white px-4 shadow-card">{recentKits.map((kit) => <RecentKit key={kit.id} kit={kit} />)}</ul> : <div className="mt-3 rounded-2xl border-y border-border bg-white py-8 text-center"><p className="font-medium">No kits yet</p><p className="mt-1 text-sm text-muted">Create a kit to start preparing for an interview.</p><LinkButton href="/new" variant="secondary" className="mt-4">Create your first kit</LinkButton></div>}
        </section>

        <section className="mt-8 border-t border-border pt-6" aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title" className="text-lg font-semibold">Quick actions</h2>
          <div className="mt-3 flex flex-wrap gap-2"><LinkButton href="/new">Create a kit</LinkButton><LinkButton href="/new/batch" variant="secondary">Import a batch</LinkButton>{recentKits[0] ? <LinkButton href={`/kits/${recentKits[0].id}/practice`} variant="secondary">Practice recent kit</LinkButton> : null}</div>
        </section>
      </section>

      <aside className="border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" aria-labelledby="profile-title">
        <h2 id="profile-title" className="text-lg font-semibold">Your profile</h2>
        <div className="mt-4 flex items-center gap-3"><span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-[#e3f2f0] text-lg font-semibold text-[#0f6b63]">{initial}</span><div className="min-w-0"><p className="truncate font-medium">{profile?.name || "PrepKit member"}</p><p className="break-all text-sm text-muted">{profile?.email || "Profile details unavailable"}</p></div></div>
        <dl className="mt-6 divide-y divide-border border-y border-border text-sm"><div className="flex justify-between gap-3 py-3"><dt className="text-muted">Workspace</dt><dd className="text-right font-medium">Personal</dd></div></dl>
        <p className="mt-4 text-xs leading-5 text-muted">Your account profile is currently stored in this browser.</p>
      </aside>
    </div>
  </div>;
}

function RecentKit({ kit }: { kit: Kit }) {
  const status = kit.status ?? "ready";
  const href = `/kits/${kit.id}${status === "generating" ? "?generating=1" : ""}`;
  return <li className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4 transition-colors hover:bg-[#f8fbfa]"><div className="min-w-0 flex-1"><Link href={href} className="font-medium text-ink transition-colors hover:text-accent">{kit.title}</Link><p className="mt-1 truncate text-sm text-muted">{kit.company} · {kit.role}</p></div><div className="flex shrink-0 items-center gap-3"><span className={`rounded px-2 py-1 text-xs font-medium ${statusStyles[status]}`}>{status === "needs_review" ? "Needs review" : status[0].toUpperCase() + status.slice(1)}</span><Link href={href} className="text-sm font-medium text-accent underline-offset-4 hover:underline">Open</Link></div></li>;
}
