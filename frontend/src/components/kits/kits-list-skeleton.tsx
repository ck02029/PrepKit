import { Skeleton } from "@/components/ui/skeleton";

export function KitsListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-busy aria-label="Loading kits">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-white p-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-3 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}
