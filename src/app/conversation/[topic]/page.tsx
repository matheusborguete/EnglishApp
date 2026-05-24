import { notFound } from "next/navigation";
import type { TopicId, Level } from "@/types";
import { TOPICS } from "@/lib/topics";
import { ConversationSession } from "@/components/ConversationSession";

interface PageProps {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ level?: string }>;
}

const VALID_LEVELS = new Set<Level>(["beginner", "intermediate", "advanced"]);

export default async function ConversationPage({ params, searchParams }: PageProps) {
  const { topic } = await params;
  const { level: levelParam } = await searchParams;

  const topicId = topic as TopicId;
  const level = (levelParam ?? "beginner") as Level;

  if (!(topicId in TOPICS)) notFound();
  if (!VALID_LEVELS.has(level)) notFound();

  return <ConversationSession topicId={topicId} level={level} />;
}

export function generateStaticParams() {
  return Object.keys(TOPICS).map((id) => ({ topic: id }));
}
