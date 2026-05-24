"use client";

import { useState, useCallback, useRef } from "react";
import type { Message, ConversationSession, CorrectionNote, TopicId, Level } from "@/types";
import { generateId, saveSession, updateProgressAfterSession } from "@/lib/storage";
import { getTopicById } from "@/lib/topics";

interface UseChatOptions {
  topicId: TopicId;
  level: Level;
  sessionId: string;
  onStreamChunk?: (chunk: string) => void;
  onStreamDone?: (fullText: string) => void;
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
    const parsed = JSON.parse(match[1]) as { corrections: CorrectionNote[]; summary: string };
    return { notes: parsed.corrections ?? [], summary: parsed.summary ?? "" };
  } catch {
    return { notes: [], summary: "" };
  }
}

export function useChat({
  topicId,
  level,
  sessionId,
  onStreamChunk,
  onStreamDone,
}: UseChatOptions): UseChatReturn {
  const topic = getTopicById(topicId);

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

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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

      try {
        // Build history excluding the empty placeholder
        const history = messagesRef.current.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...history, { role: "user", content }],
            topicId,
            level,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const { delta } = JSON.parse(data) as { delta: string };
              if (delta) {
                accumulated += delta;
                onStreamChunk?.(delta);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMessageId
                      ? { ...m, content: accumulated, isStreaming: true }
                      : m
                  )
                );
              }
            } catch {
              // Partial JSON line — skip
            }
          }
        }

        // Mark streaming done
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, content: accumulated, isStreaming: false } : m
          )
        );

        onStreamDone?.(accumulated);

        // Persist session
        const updatedMessages: Message[] = [
          ...messagesRef.current,
          userMessage,
          { id: aiMessageId, role: "assistant" as const, content: accumulated, timestamp: Date.now() },
        ];
        sessionRef.current = { ...sessionRef.current, messages: updatedMessages };
        saveSession(sessionRef.current);
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, hasEnded, topicId, level, onStreamChunk, onStreamDone]
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
