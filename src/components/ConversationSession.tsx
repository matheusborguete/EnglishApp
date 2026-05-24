"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TopicId, Level } from "@/types";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { generateId } from "@/lib/storage";
import { getTopicById } from "@/lib/topics";
import { ChatBubble } from "./ChatBubble";
import { VoiceButton } from "./VoiceButton";
import { CorrectionsPanel } from "./CorrectionsPanel";

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

interface ConversationSessionProps {
  topicId: TopicId;
  level: Level;
}

export function ConversationSession({ topicId, level }: ConversationSessionProps) {
  const router = useRouter();
  const topic = getTopicById(topicId);
  const sessionId = useRef(generateId()).current;

  const handleTranscriptFinal = useCallback(
    (text: string) => { if (text.trim()) sendMessage(text.trim()); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const {
    voiceState, isSTTSupported, isTTSSupported,
    transcript, startListening, stopListening,
    feedChunk, flushSpeech, speak, stopSpeaking,
  } = useVoice(handleTranscriptFinal);

  const {
    messages, isLoading, error,
    hasEnded, corrections, sessionSummary,
    sendMessage, endSession,
  } = useChat({
    topicId,
    level,
    sessionId,
    onStreamChunk: feedChunk,
    onStreamDone: flushSpeech,
  });

  const [textInput, setTextInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openingSpoken = useRef(false);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Speak the opening message once TTS is ready
  useEffect(() => {
    if (isTTSSupported && !openingSpoken.current && messages.length === 1) {
      openingSpoken.current = true;
      speak(messages[0].content);
    }
  }, [isTTSSupported, messages, speak]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = textInput.trim();
    if (!value || isLoading) return;
    sendMessage(value);
    setTextInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleEndSession = () => {
    if (window.confirm("Encerrar a conversa e ver suas correções?")) {
      stopSpeaking();
      endSession();
    }
  };

  const userMessageCount = messages.filter((m) => m.role === "user").length;

  if (hasEnded) {
    return (
      <CorrectionsPanel
        corrections={corrections}
        summary={sessionSummary}
        topicTitle={topic.titlePT}
        messageCount={userMessageCount}
        onNewTopic={() => router.push("/")}
        onSameTopic={() => router.push(`/conversation/${topicId}?level=${level}`)}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{topic.emoji}</span>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">{topic.titlePT}</h1>
            <span className="text-xs text-gray-400 capitalize">
              {level === "beginner" ? "Iniciante" : level === "intermediate" ? "Intermediário" : "Avançado"}
            </span>
          </div>
        </div>
        <button
          onClick={handleEndSession}
          className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-full hover:bg-red-50 transition-colors font-medium"
        >
          Encerrar
        </button>
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {/* Live transcript preview */}
        {voiceState === "listening" && transcript && (
          <div className="flex justify-end mb-4">
            <div className="bg-sky-50 border border-sky-200 text-sky-700 px-4 py-2 rounded-2xl text-sm italic max-w-[78%]">
              {transcript}...
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mx-auto max-w-sm bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs text-center my-2">
            {error.includes("GROQ_API_KEY") ? (
              <>
                <strong>Configure a chave da API</strong>
                <br />
                Adicione <code>GROQ_API_KEY</code> nas variáveis de ambiente do Vercel.
              </>
            ) : (
              <>Erro ao processar. Tente novamente.<br /><code className="text-red-400">{error.slice(0, 80)}</code></>
            )}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100 px-4 py-3 safe-area-bottom">
        <div className="flex items-end gap-3 max-w-2xl mx-auto">
          {isSTTSupported && (
            <VoiceButton
              voiceState={voiceState}
              isSupported={isSTTSupported}
              onStart={startListening}
              onStop={stopListening}
              disabled={isLoading}
            />
          )}

          <form onSubmit={handleSubmit} className="flex-1 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={textInput}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={isSTTSupported ? "Ou escreva aqui..." : "Escreva sua mensagem..."}
              disabled={isLoading}
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent placeholder:text-gray-300 disabled:opacity-50 bg-gray-50"
              style={{ minHeight: "42px", maxHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={!textInput.trim() || isLoading}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <SendIcon />
              )}
            </button>
          </form>
        </div>

        {/* Skip TTS */}
        {voiceState === "speaking" && (
          <button
            onClick={stopSpeaking}
            className="flex items-center justify-center gap-1 mx-auto mt-2 text-xs text-gray-400 hover:text-gray-600 w-full"
          >
            ▾ Toque para pular a fala
          </button>
        )}
      </div>
    </div>
  );
}
