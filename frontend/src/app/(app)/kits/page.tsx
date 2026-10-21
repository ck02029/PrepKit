import { KitsPageContent } from "@/components/kits/kits-page-content";

export default async function KitsPage({ searchParams }: { searchParams: Promise<{ duplicate?: string }> }) {
  const params = await searchParams;
  return <KitsPageContent duplicate={params.duplicate === "1"} />;
}
