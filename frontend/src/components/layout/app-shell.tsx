import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/layout/sign-out-button";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6 lg:px-8">
          <Link
            href="/"
            className="inline-flex min-h-touch items-center text-lg font-semibold text-ink transition-colors hover:text-accent"
          >
            PrepKit
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-1">
            <Link
              href="/new"
              className="inline-flex min-h-touch items-center justify-center rounded-lg px-3 text-sm font-medium text-muted hover:bg-page hover:text-ink"
            >
              New kit
            </Link>
            <Link href="/kits" className="inline-flex min-h-touch items-center justify-center rounded-lg px-3 text-sm font-medium text-muted hover:bg-page hover:text-ink">My kits</Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
