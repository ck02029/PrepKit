import { PracticeContent } from "@/components/practice/practice-content";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ topic?: string; day?: string; questions?: string }> };
export default async function PracticePage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const day = query.day && Number.isInteger(Number(query.day)) ? Number(query.day) : undefined;
  return <PracticeContent kitId={id} initialTopic={query.topic} initialDay={day} initialQuestionIds={query.questions?.split(",").filter(Boolean)} />;
}
