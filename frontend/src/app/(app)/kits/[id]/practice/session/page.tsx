import { PracticeSessionContent } from "@/components/practice/practice-session-content";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ sessionId?: string }> };
export default async function PracticeSessionPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <PracticeSessionContent kitId={id} sessionId={query.sessionId ?? ""} />;
}
