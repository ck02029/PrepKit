import { ReportContent } from "@/components/practice/report-content";

type Props = { params: Promise<{ id: string }> };
export default async function ReportPage({ params }: Props) {
  const { id } = await params;
  return <ReportContent kitId={id} />;
}
