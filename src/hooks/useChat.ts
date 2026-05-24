"use client";

import { useState, useCallback, useRef } from "react";
import Groq from "groq-sdk";
import type { Message, ConversationSession, CorrectionNote, TopicId, Level } from "@/types";
import { generateId, saveSession, updateProgressAfterSession } from "@/lib/storage";
import { getTopicById } from "@/lib/topics";
import { buildSystemPrompt } from "@/lib/prompts";
import { getApiKey } from "@/lib/apikey";

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

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading || hasEnded) return;

      const apiKey = getApiKey();
      if (!apiKey) {
        setError("Chave da API não encontrada. Volte à tela inicial.");
        return;
      }

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      const aiMessageId = generateId();
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: aiMessageId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true },
      ]);
      setIsLoading(true);
      setError(null);

      try {
        const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

        const history = messagesRef.current.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

        const stream = await groq.chat.completions.create({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content },
          ],
          stream: true,
          temperature: 0.8,
          max_tokens: 300,
        });

        let accumulated = "";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            accumulated += delta;
            onStreamChunk?.(delta);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMessageId ? { ...m, content: accumulated, isStreaming: true } : m
              )
            );
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMessageId ? { ...m, content: accumulated, isStreaming: false } : m
          )
        );

        onStreamDone?.(accumulated);

        const updatedMessages: Message[] = [
          ...messagesRef.current,
          userMessage,
          { id: aiMessageId, role: "assistant" as const, content: accumulated, timestamp: Date.now() },
        ];
        sessionRef.current = { ...sessionRef.current, messages: updatedMessages };
        saveSession(sessionRef.current);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== aiMessageId));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, hasEnded, systemPrompt, onStreamChunk, onStreamDone]
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
