import type { ConversationSession, UserProgress, TopicId } from "@/types";

const KEYS = {
  SESSIONS: "englishapp_sessions",
  PROGRESS: "englishapp_progress",
  MODEL_READY: "englishapp_model_ready",
} as const;

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn("localStorage write failed for key:", key);
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isModelReady(): boolean {
  return safeGet<boolean>(KEYS.MODEL_READY, false);
}

export function setModelReady(): void {
  safeSet(KEYS.MODEL_READY, true);
}

export function loadSessions(): ConversationSession[] {
  return safeGet<ConversationSession[]>(KEYS.SESSIONS, []);
}

export function saveSession(session: ConversationSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  safeSet(KEYS.SESSIONS, sessions.slice(-50));
}

const DEFAULT_PROGRESS: UserProgress = {
  streak: 0,
  lastPracticeDate: "",
  totalSessions: 0,
  totalMinutes: 0,
  weeklySessionDates: [],
  topicsCompleted: {},
};

export function loadProgress(): UserProgress {
  return safeGet<UserProgress>(KEYS.PROGRESS, DEFAULT_PROGRESS);
}

export function updateProgressAfterSession(session: ConversationSession): void {
  const progress = loadProgress();
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  if (progress.lastPracticeDate === yesterday) {
    progress.streak++;
  } else if (progress.lastPracticeDate !== today) {
    progress.streak = 1;
  }
  progress.lastPracticeDate = today;
  progress.totalSessions++;

  const durationMs = (session.endedAt ?? Date.now()) - session.startedAt;
  progress.totalMinutes += Math.round(durationMs / 60_000);

  const topicId = session.topicId as TopicId;
  progress.topicsCompleted[topicId] = (progress.topicsCompleted[topicId] ?? 0) + 1;

  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split("T")[0];
  progress.weeklySessionDates = [
    ...progress.weeklySessionDates.filter((d) => d >= sevenDaysAgo),
    today,
  ];

  safeSet(KEYS.PROGRESS, progress);
}
