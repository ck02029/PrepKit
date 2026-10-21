import { KitDetailContent } from "@/components/kits/kit-detail-content";

type KitPageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ generating?: string }> };

export default async function KitPage({ params, searchParams }: KitPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <KitDetailContent kitId={id} generating={query.generating === "1"} />;
}
