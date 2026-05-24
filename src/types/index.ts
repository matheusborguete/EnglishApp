export type Level = "beginner" | "intermediate" | "advanced";

export type TopicId =
  | "introductions"
  | "daily-life"
  | "restaurant"
  | "shopping"
  | "doctor"
  | "travel"
  | "work"
  | "movies-tv";

export interface Topic {
  id: TopicId;
  emoji: string;
  titleEN: string;
  titlePT: string;
  descriptionPT: string;
  difficulty: Level;
  starterMessage: string;
  vocabularyHints: string[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface CorrectionNote {
  original: string;
  improved: string;
  rule: string;
  category: "grammar" | "vocabulary" | "tense" | "preposition" | "idiom";
}

export interface ConversationSession {
  id: string;
  topicId: TopicId;
  level: Level;
  messages: Message[];
  startedAt: number;
  endedAt?: number;
  corrections?: CorrectionNote[];
}

export interface UserProgress {
  streak: number;
  lastPracticeDate: string;
  totalSessions: number;
  totalMinutes: number;
  weeklySessionDates: string[];
  topicsCompleted: Partial<Record<TopicId, number>>;
}

export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export type EngineStatus = "idle" | "loading" | "ready" | "error";
