"use client";

import { useState, useCallback, useRef } from "react";
import type { Message, ConversationSession, CorrectionNote, TopicId, Level } from "@/types";
import { generateId, saveSession, updateProgressAfterSession } from "@/lib/storage";
import { buildSystemPrompt } from "@/lib/prompts";
import { getTopicById } from "@/lib/topics";
import { streamChat } from "@/lib/webllm";

interface UseChatOptions {
  topicId: TopicId;
  level: Level;
  sessionId: string;
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  hasEnded: boolean;
  corrections: CorrectionNote[];
  sessionSummary: string;
  sendMessage: (content: string) => Promise<void>;
  endSession: () => Promise<void>;
}

function parseCorrections(text: string): { notes: CorrectionNote[]; summary: string } {
  const match = text.match(/<corrections>([\s\S]*?)<\/corrections>/);
  if (!match) return { notes: [], summary: "" };
  try {
    const parsed = JSON.parse(match[1]) as {
      corrections: CorrectionNote[];
      summary: string;
    };
    return { notes: parsed.corrections ?? [], summary: parsed.summary ?? "" };
  } catch {
    return { notes: [], summary: "" };
  }
}

export function useChat({ topicId, level, sessionId }: UseChatOptions): UseChatReturn {
  const topic = getTopicById(topicId);
  const systemPrompt = buildSystemPrompt(topicId, level);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: generateId(),
      role: "assistant",
      content: topic.starterMessage,
      timestamp: Date.now(),
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [corrections, setCorrections] = useState<CorrectionNote[]>([]);
  const [sessionSummary, setSessionSummary] = useState("");

  const sessionRef = useRef<ConversationSession>({
    id: sessionId,
    topicId,
    level,
    messages: [],
    startedAt: Date.now(),
  });

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading || hasEnded) return;

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      const aiMessageId = generateId();
      const aiPlaceholder: Message = {
        id: aiMessageId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, aiPlaceholder]);
      setIsLoading(true);
      setError(null);

      abortRef.current = new AbortController();

      try {
        // Build full message history for WebLLM
        const history = messages.map((m) => ({ role: m.role, content: m.content }));
        const fullMessages = [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content },
        ];

        let accumulated = "";

        await streamChat(
          fullMessages,
          (chunk) => {
            accumulated += chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMessageId ? { ...m, content: accumulated, isStreaming: true } : m
              )
            );
          },
          abortRef.current.signal
        );

        // Finalize streaming message
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, content: accumulated, isStreaming: false } : m
          )
        );

        // Save session to localStorage
        const updatedMessages: Message[] = [
          ...messages,
          userMessage,
          {
            id: aiMessageId,
            role: "assistant" as const,
            content: accumulated,
            timestamp: Date.now(),
          },
        ];
        sessionRef.current = { ...sessionRef.current, messages: updatedMessages };
        saveSession(sessionRef.current);
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, hasEnded, messages, systemPrompt]
  );

  const endSession = useCallback(async () => {
    if (hasEnded) return;
    await sendMessage("[END_SESSION]");
    setHasEnded(true);

    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.role === "assistant") {
        const { notes, summary } = parseCorrections(lastMsg.content);
        setCorrections(notes);
        setSessionSummary(summary);

        const finalSession: ConversationSession = {
          ...sessionRef.current,
          messages: prev,
          endedAt: Date.now(),
          corrections: notes,
        };
        saveSession(finalSession);
        updateProgressAfterSession(finalSession);
      }
      return prev;
    });
  }, [hasEnded, sendMessage]);

  return {
    messages,
    isLoading,
    error,
    hasEnded,
    corrections,
    sessionSummary,
    sendMessage,
    endSession,
  };
}
