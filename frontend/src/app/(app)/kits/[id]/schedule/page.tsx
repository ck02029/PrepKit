import { ScheduleContent } from "@/components/kits/schedule-content";

type Props = { params: Promise<{ id: string }> };
export default async function SchedulePage({ params }: Props) {
  const { id } = await params;
  return <ScheduleContent kitId={id} />;
}
