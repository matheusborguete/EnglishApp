"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { TopicId, Level } from "@/types";
import { useChat } from "@/hooks/useChat";
import { useVoice } from "@/hooks/useVoice";
import { generateId } from "@/lib/storage";
import { getTopicById } from "@/lib/topics";
import { ChatBubble } from "./ChatBubble";
import { CorrectionsPanel } from "./CorrectionsPanel";
import { WordCard } from "./WordCard";
import { lookupWord, type WordInfo } from "@/lib/wordLookup";

/* ── Icons ── */
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const MicIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
    <rect x="4" y="4" width="16" height="16" rx="3" />
  </svg>
);
const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

type InputMode = "text" | "voice";

interface Props { topicId: TopicId; level: Level; }

export function ConversationSession({ topicId, level }: Props) {
  const router = useRouter();
  const topic = getTopicById(topicId);
  const sessionId = useRef(generateId()).current;

  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [conversationMode, setConversationMode] = useState(false);
  const [textInput, setTextInput] = useState("");

  // Word lookup state
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordInfo, setWordInfo] = useState<WordInfo | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);

  const handleWordTap = useCallback(async (word: string) => {
    setSelectedWord(word);
    setWordInfo(null);
    setWordError(null);
    setWordLoading(true);
    try {
      const info = await lookupWord(word);
      setWordInfo(info);
    } catch {
      setWordError("Não foi possível traduzir.");
    } finally {
      setWordLoading(false);
    }
  }, []);

  const handleWordClose = useCallback(() => {
    setSelectedWord(null);
    setWordInfo(null);
    setWordError(null);
  }, []);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openingSpokenRef = useRef(false);

  /* ── Voice ── */
  const handleTranscriptFinal = useCallback((text: string) => {
    sendMessage(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSpeechEnd = useCallback(() => {
    // In conversation mode, auto-restart mic after Emma finishes speaking
    if (conversationMode) {
      setTimeout(() => startListening(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationMode]);

  const {
    voiceState, isSTTSupported, isTTSSupported,
    transcript, startListening, stopListening,
    speak, stopSpeaking, resetToIdle,
  } = useVoice({ onTranscriptFinal: handleTranscriptFinal, onSpeechEnd: handleSpeechEnd });

  /* ── Chat ── */
  const handleResponseDone = useCallback((text: string) => {
    resetToIdle();          // Fix: unblock mic after AI responds
    speak(text);            // Speak the AI response
  }, [resetToIdle, speak]);

  const {
    messages, isLoading, error,
    hasEnded, corrections, sessionSummary,
    sendMessage, endSession,
  } = useChat({ topicId, level, sessionId, onResponseDone: handleResponseDone });

  /* ── Auto-scroll ── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── Speak opening message ── */
  useEffect(() => {
    if (isTTSSupported && !openingSpokenRef.current && messages.length === 1) {
      openingSpokenRef.current = true;
      // Small delay so the browser TTS engine is fully ready
      setTimeout(() => speak(messages[0].content), 500);
    }
  }, [isTTSSupported, messages, speak]);

  /* ── Text submit ── */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = textInput.trim();
    if (!v || isLoading) return;
    sendMessage(v);
    setTextInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleEnd = () => {
    if (window.confirm("Encerrar e ver correções?")) { stopSpeaking(); endSession(); }
  };

  const userCount = messages.filter((m) => m.role === "user").length;

  if (hasEnded) {
    return (
      <CorrectionsPanel
        corrections={corrections} summary={sessionSummary}
        topicTitle={topic.titlePT} messageCount={userCount}
        onNewTopic={() => router.push("/")}
        onSameTopic={() => router.push(`/conversation/${topicId}?level=${level}`)}
      />
    );
  }

  /* ── Voice mode mic button state ── */
  const micBusy = isLoading || voiceState === "speaking";
  const isListening = voiceState === "listening";
  const isSpeaking = voiceState === "speaking";
  const isProcessing = voiceState === "processing";

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{topic.emoji}</span>
          <div>
            <h1 className="font-semibold text-gray-900 text-sm">{topic.titlePT}</h1>
            <span className="text-xs text-gray-400">
              {level === "beginner" ? "Iniciante" : level === "intermediate" ? "Intermediário" : "Avançado"}
            </span>
          </div>
        </div>
        <button onClick={handleEnd} className="px-3 py-1.5 text-xs text-red-500 border border-red-200 rounded-full hover:bg-red-50 font-medium">
          Encerrar
        </button>
      </header>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            onWordTap={msg.role === "assistant" ? handleWordTap : undefined}
          />
        ))}

        {isListening && transcript && (
          <div className="flex justify-end mb-4">
            <div className="bg-sky-50 border border-sky-200 text-sky-700 px-4 py-2 rounded-2xl text-sm italic max-w-[78%]">
              {transcript}…
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs text-center my-2 mx-auto max-w-sm">
            {error.slice(0, 100)}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100 safe-area-bottom">

        {/* Mode tabs — only show if STT supported */}
        {isSTTSupported && (
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => { setInputMode("voice"); setConversationMode(false); }}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${inputMode === "voice" && !conversationMode ? "text-sky-600 border-b-2 border-sky-500" : "text-gray-400"}`}
            >
              🎙️ Gravar
            </button>
            <button
              onClick={() => { setInputMode("voice"); setConversationMode(true); if (!isListening && !micBusy) startListening(); }}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${conversationMode ? "text-sky-600 border-b-2 border-sky-500" : "text-gray-400"}`}
            >
              💬 Conversa
            </button>
            <button
              onClick={() => { setInputMode("text"); setConversationMode(false); stopListening(); }}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${inputMode === "text" ? "text-sky-600 border-b-2 border-sky-500" : "text-gray-400"}`}
            >
              ⌨️ Texto
            </button>
          </div>
        )}

        <div className="px-4 py-4">

          {/* ── CONVERSATION MODE ── */}
          {conversationMode && (
            <div className="flex flex-col items-center gap-3">
              <ConversationModeButton
                voiceState={voiceState}
                isLoading={isLoading}
                onStop={() => { setConversationMode(false); stopListening(); stopSpeaking(); }}
              />
              <p className="text-xs text-gray-400 text-center">
                {isListening ? "Te ouvindo... fale em inglês"
                  : isSpeaking ? "Emma está falando — toque para parar"
                  : isLoading || isProcessing ? "Processando..."
                  : "Aguardando..."}
              </p>
              {isSpeaking && (
                <button onClick={() => { stopSpeaking(); setTimeout(() => startListening(), 200); }} className="text-xs text-sky-500 underline">
                  Pular fala da Emma
                </button>
              )}
            </div>
          )}

          {/* ── VOICE MANUAL MODE ── */}
          {inputMode === "voice" && !conversationMode && isSTTSupported && (
            <div className="flex flex-col items-center gap-3">
              <button
                onPointerDown={startListening}
                onPointerUp={isListening ? stopListening : undefined}
                onClick={isListening ? stopListening : undefined}
                disabled={micBusy}
                className={`w-20 h-20 rounded-full flex items-center justify-center text-white transition-all duration-200 active:scale-95 disabled:opacity-40 shadow-lg
                  ${isListening ? "bg-red-500 ring-4 ring-red-300 animate-pulse" : isSpeaking ? "bg-purple-500" : "bg-sky-500 hover:bg-sky-600"}`}
              >
                {isSpeaking ? <SpeakerIcon /> : isListening ? <StopIcon /> : <MicIcon />}
              </button>
              <p className="text-xs text-gray-400 text-center">
                {isListening ? "Solte para enviar"
                  : isSpeaking ? "Emma está falando"
                  : isLoading || isProcessing ? "Processando..."
                  : "Pressione e fale em inglês"}
              </p>
              {isSpeaking && (
                <button onClick={stopSpeaking} className="text-xs text-sky-500 underline">
                  Parar fala
                </button>
              )}
            </div>
          )}

          {/* ── TEXT MODE ── */}
          {inputMode === "text" && (
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={textInput}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Escreva sua mensagem em inglês..."
                disabled={isLoading}
                rows={1}
                className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-transparent placeholder:text-gray-300 disabled:opacity-50 bg-gray-50"
                style={{ minHeight: "42px", maxHeight: "120px" }}
              />
              <button
                type="submit"
                disabled={!textInput.trim() || isLoading}
                className="w-11 h-11 rounded-full flex items-center justify-center bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {isLoading
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <SendIcon />}
              </button>
            </form>
          )}

        </div>
      </div>

      {/* Word lookup card */}
      {selectedWord && (
        <WordCard
          word={selectedWord}
          info={wordInfo}
          loading={wordLoading}
          error={wordError}
          onClose={handleWordClose}
        />
      )}
    </div>
  );
}

/* ── Conversation Mode Big Button ── */
function ConversationModeButton({
  voiceState, isLoading, onStop,
}: {
  voiceState: string;
  isLoading: boolean;
  onStop: () => void;
}) {
  const isListening = voiceState === "listening";
  const isSpeaking = voiceState === "speaking";
  const busy = isLoading || voiceState === "processing";

  return (
    <div className="relative flex items-center justify-center">
      {/* Ripple rings */}
      {isListening && (
        <>
          <span className="absolute w-28 h-28 rounded-full bg-red-200 opacity-40 animate-ping" />
          <span className="absolute w-24 h-24 rounded-full bg-red-200 opacity-30 animate-ping [animation-delay:0.3s]" />
        </>
      )}
      {isSpeaking && (
        <span className="absolute w-28 h-28 rounded-full bg-purple-200 opacity-40 animate-pulse" />
      )}

      <button
        onClick={onStop}
        className={`relative w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl transition-all duration-300
          ${isListening ? "bg-red-500" : isSpeaking ? "bg-purple-500" : busy ? "bg-amber-400" : "bg-sky-500"}`}
        aria-label="Parar modo conversa"
      >
        {isSpeaking ? <SpeakerIcon /> : isListening ? <MicIcon /> : busy
          ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <MicIcon />}
      </button>
    </div>
  );
}
