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
import { PhraseHelper } from "./PhraseHelper";
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

// How long a pointer must be held to count as "hold-to-record" vs a quick tap.
const HOLD_THRESHOLD_MS = 350;

// Speech rate is level-dependent so beginners can follow Emma more easily.
// The debounce (conversation mode only) is a short fixed value — just enough
// to stitch together a brief STT pause without making the conversation feel sluggish.
const SPEECH_RATE = { beginner: 0.80, intermediate: 0.90, advanced: 1.00 } as const;
const CONVERSATION_DEBOUNCE_MS = 400;

type InputMode = "text" | "voice" | "conversation";

interface Props { topicId: TopicId; level: Level; }

export function ConversationSession({ topicId, level }: Props) {
  const router = useRouter();
  const topic = getTopicById(topicId);
  const sessionId = useRef(generateId()).current;

  // Single input-mode state instead of the previous (inputMode + conversationMode) pair.
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [textInput, setTextInput] = useState("");
  const [showPhraseHelper, setShowPhraseHelper] = useState(false);

  // Word-lookup state
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [wordInfo, setWordInfo] = useState<WordInfo | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const [wordError, setWordError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openingSpokenRef = useRef(false);

  // ── Voice hook ────────────────────────────────────────────────────────────
  // autoSend drives whether the hook auto-fires after silence (conversation
  // mode) or waits for the user to call stopListening() explicitly (voice mode).
  // Ref-forwarding pattern: handleTranscriptFinal and the auto-restart callback
  // both need to call functions (sendMessage, startListening) that are defined
  // after the hook call. We thread them through refs updated in effects.
  const sendMessageRef = useRef<(text: string) => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});
  const inputModeRef = useRef<InputMode>(inputMode);
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);

  const handleTranscriptFinal = useCallback((text: string) => {
    sendMessageRef.current(text);
  }, []);

  const handleSpeechEnd = useCallback(() => {
    // Only auto-restart in conversation mode.
    if (inputModeRef.current === "conversation") {
      setTimeout(() => startListeningRef.current(), 300);
    }
  }, []);

  const {
    voiceState,
    isSTTSupported,
    isTTSSupported,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    resetToIdle,
    unlockTTS,
  } = useVoice({
    onTranscriptFinal: handleTranscriptFinal,
    onSpeechEnd: handleSpeechEnd,
    autoSend: inputMode === "conversation",
    finalDebounceMs: CONVERSATION_DEBOUNCE_MS,
    speechRate: SPEECH_RATE[level],
  });

  // Keep refs in sync after hook values are available.
  useEffect(() => { startListeningRef.current = () => { unlockTTS(); startListening(); }; },
    [unlockTTS, startListening]);

  // ── Chat hook ─────────────────────────────────────────────────────────────
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const handleResponseDone = useCallback((text: string, msgId?: string) => {
    resetToIdle();
    if (msgId) setSpeakingMsgId(msgId);
    speak(text);
  }, [resetToIdle, speak]);

  const {
    messages, isLoading, error,
    hasEnded, corrections, sessionSummary,
    sendMessage, endSession,
  } = useChat({ topicId, level, sessionId, onResponseDone: handleResponseDone });

  // Wire sendMessage into the ref so handleTranscriptFinal can call it.
  useEffect(() => { sendMessageRef.current = sendMessage; }, [sendMessage]);

  // ── Phrase helper ─────────────────────────────────────────────────────────
  const handleUsePhrase = useCallback((phrase: string) => {
    setShowPhraseHelper(false);
    if (inputMode === "text") {
      setTextInput(phrase);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      unlockTTS();
      sendMessage(phrase);
    }
  }, [inputMode, unlockTTS, sendMessage]);

  // ── Word lookup ───────────────────────────────────────────────────────────
  const handleWordTap = useCallback(async (word: string) => {
    setSelectedWord(word);
    setWordInfo(null);
    setWordError(null);
    setWordLoading(true);
    try {
      setWordInfo(await lookupWord(word));
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

  // ── Mode switching ────────────────────────────────────────────────────────
  const enterVoiceMode = useCallback(() => {
    stopListening();
    stopSpeaking();
    setInputMode("voice");
  }, [stopListening, stopSpeaking]);

  const enterConversationMode = useCallback(() => {
    setInputMode("conversation");
    // Start listening after the state (and autoSend ref) update propagates.
    // The 80ms delay inside startListening gives React time to commit.
    startListeningRef.current();
  }, []);

  const enterTextMode = useCallback(() => {
    stopListening();
    stopSpeaking();
    setInputMode("text");
  }, [stopListening, stopSpeaking]);

  const exitConversationMode = useCallback(() => {
    stopListening();
    stopSpeaking();
    setInputMode("voice");
  }, [stopListening, stopSpeaking]);

  // ── Manual voice: dual-gesture mic (hold OR tap-toggle) ───────────────────
  // holdStartTimeRef tracks when pointer went down so we can distinguish a
  // hold gesture (>= HOLD_THRESHOLD_MS, release sends) from a tap (< threshold,
  // start recording; second tap sends).
  const holdStartTimeRef = useRef<number | null>(null);
  // True while the current recording was started by a quick tap (toggle mode).
  const isTapModeRef = useRef(false);

  const handleMicPointerDown = useCallback(() => {
    if (voiceState !== "idle") return;
    isTapModeRef.current = false;
    holdStartTimeRef.current = Date.now();
    unlockTTS();
    startListening();
  }, [voiceState, unlockTTS, startListening]);

  const handleMicPointerUp = useCallback(() => {
    if (voiceState !== "listening" || holdStartTimeRef.current === null) return;
    const elapsed = Date.now() - holdStartTimeRef.current;
    holdStartTimeRef.current = null;
    if (elapsed >= HOLD_THRESHOLD_MS) {
      // Hold gesture → stop on release.
      isTapModeRef.current = false;
      stopListening();
    } else {
      // Quick tap → enter toggle mode; wait for a second tap to stop.
      isTapModeRef.current = true;
    }
  }, [voiceState, stopListening]);

  const handleMicClick = useCallback(() => {
    if (isTapModeRef.current) {
      // This onClick is from the same gesture that started recording — skip.
      isTapModeRef.current = false;
      return;
    }
    if (voiceState === "listening") {
      // Second tap in toggle mode → stop and send.
      stopListening();
    }
  }, [voiceState, stopListening]);

  // ── Side effects ──────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isTTSSupported && !openingSpokenRef.current && messages.length === 1) {
      openingSpokenRef.current = true;
      setTimeout(() => speak(messages[0].content), 500);
    }
  }, [isTTSSupported, messages, speak]);

  useEffect(() => {
    if (voiceState !== "speaking") setSpeakingMsgId(null);
  }, [voiceState]);

  // ── Text submit ───────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = textInput.trim();
    if (!v || isLoading) return;
    unlockTTS();
    sendMessage(v);
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

  const handleSpeakMessage = useCallback((msgId: string, content: string) => {
    if (voiceState === "speaking" && speakingMsgId === msgId) {
      stopSpeaking();
    } else {
      unlockTTS();
      setSpeakingMsgId(msgId);
      speak(content);
    }
  }, [voiceState, speakingMsgId, stopSpeaking, unlockTTS, speak]);

  const handleEnd = () => {
    if (window.confirm("Encerrar e ver correções?")) {
      stopSpeaking();
      endSession();
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const isListening   = voiceState === "listening";
  const isSpeaking    = voiceState === "speaking";
  const isProcessing  = voiceState === "processing";
  const userCount     = messages.filter((m) => m.role === "user").length;

  // ── End screen ────────────────────────────────────────────────────────────
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

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">

      {/* ── Header ── */}
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

      {/* ── Chat ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            onWordTap={msg.role === "assistant" ? handleWordTap : undefined}
            onSpeak={
              !msg.isStreaming && msg.content
                ? () => handleSpeakMessage(msg.id, msg.content)
                : undefined
            }
            isSpeaking={speakingMsgId === msg.id && isSpeaking}
          />
        ))}

        {/* Live transcript preview while recording */}
        {isListening && transcript && (
          <div className="flex justify-end mb-4">
            <div className="bg-sky-50 border border-sky-200 text-sky-700 px-4 py-2 rounded-2xl text-sm italic max-w-[78%]">
              {transcript}…
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs text-center my-2 mx-auto max-w-sm">
            {error.slice(0, 120)}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 bg-white border-t border-gray-100 safe-area-bottom">

        {/* Mode tabs */}
        {isSTTSupported && (
          <div className="flex border-b border-gray-100">
            <button
              onClick={enterVoiceMode}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                inputMode === "voice" ? "text-sky-600 border-b-2 border-sky-500" : "text-gray-400"
              }`}
            >
              🎙️ Voz
            </button>
            <button
              onClick={enterConversationMode}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                inputMode === "conversation" ? "text-sky-600 border-b-2 border-sky-500" : "text-gray-400"
              }`}
            >
              💬 Conversa
            </button>
            <button
              onClick={enterTextMode}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                inputMode === "text" ? "text-sky-600 border-b-2 border-sky-500" : "text-gray-400"
              }`}
            >
              ⌨️ Texto
            </button>
          </div>
        )}

        <div className="px-4 py-3">

          {/* ══════════════════════════════════════════════════════════════
              VOICE MODE — user controls every send via hold or tap-toggle.
              autoSend = false in useVoice, so no debounce auto-fires.
          ══════════════════════════════════════════════════════════════ */}
          {inputMode === "voice" && isSTTSupported && (
            <div className="flex flex-col items-center gap-2">
              <button
                onPointerDown={handleMicPointerDown}
                onPointerUp={handleMicPointerUp}
                onClick={handleMicClick}
                disabled={isLoading || (isSpeaking && !isListening)}
                className={[
                  "w-16 h-16 rounded-full flex items-center justify-center text-white",
                  "transition-all duration-200 active:scale-95 shadow-lg select-none touch-none",
                  isListening
                    ? "bg-red-500 ring-4 ring-red-200 animate-pulse"
                    : isSpeaking
                    ? "bg-purple-500 opacity-50"
                    : isLoading || isProcessing
                    ? "bg-amber-400"
                    : "bg-sky-500 hover:bg-sky-600",
                ].join(" ")}
              >
                {isLoading || isProcessing
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : isSpeaking
                  ? <SpeakerIcon />
                  : isListening
                  ? <StopIcon />
                  : <MicIcon className="w-7 h-7" />}
              </button>

              <p className="text-xs font-medium text-center">
                {isListening
                  ? <span className="text-red-500">Gravando… toque para enviar ✓</span>
                  : isSpeaking
                  ? <span className="text-purple-500">Emma está falando</span>
                  : isLoading || isProcessing
                  ? <span className="text-amber-500">Processando…</span>
                  : <span className="text-sky-600">Toque · ou segure e solte</span>}
              </p>

              {isSpeaking && (
                <button onClick={stopSpeaking} className="text-xs text-sky-500 underline">
                  Parar fala da Emma
                </button>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              CONVERSATION MODE — mic restarts automatically after each
              Emma response. autoSend = true, debounce drives the send.
          ══════════════════════════════════════════════════════════════ */}
          {inputMode === "conversation" && (
            <div className="flex flex-col items-center gap-2">
              <ConversationModeButton
                voiceState={voiceState}
                isLoading={isLoading}
                onStop={exitConversationMode}
              />
              <p className="text-xs text-gray-400 text-center">
                {isListening
                  ? "Te ouvindo… fale em inglês"
                  : isSpeaking
                  ? "Emma está falando"
                  : isLoading || isProcessing
                  ? "Processando…"
                  : "Aguardando…"}
              </p>
              {isSpeaking && (
                <button
                  onClick={() => { stopSpeaking(); setTimeout(() => startListeningRef.current(), 200); }}
                  className="text-xs text-sky-500 underline"
                >
                  Pular fala da Emma
                </button>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              TEXT MODE
          ══════════════════════════════════════════════════════════════ */}
          {inputMode === "text" && (
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={textInput}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Escreva sua mensagem em inglês…"
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

          {/* Phrase helper button — visible in all modes */}
          <div className="mt-2 flex justify-center">
            <button
              onClick={() => setShowPhraseHelper(true)}
              className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 active:scale-95 transition-all"
            >
              💡 Não sei como falar
            </button>
          </div>

        </div>
      </div>

      {/* ── Overlays ── */}
      {selectedWord && (
        <WordCard
          word={selectedWord}
          info={wordInfo}
          loading={wordLoading}
          error={wordError}
          onClose={handleWordClose}
        />
      )}
      {showPhraseHelper && (
        <PhraseHelper
          topicId={topicId}
          onUsePhrase={handleUsePhrase}
          onClose={() => setShowPhraseHelper(false)}
        />
      )}
    </div>
  );
}

/* ── Conversation Mode Button ──────────────────────────────────────────────── */
function ConversationModeButton({
  voiceState, isLoading, onStop,
}: {
  voiceState: string;
  isLoading: boolean;
  onStop: () => void;
}) {
  const isListening = voiceState === "listening";
  const isSpeaking  = voiceState === "speaking";
  const busy        = isLoading || voiceState === "processing";

  return (
    <div className="relative flex items-center justify-center">
      {isListening && (
        <>
          <span className="absolute w-24 h-24 rounded-full bg-red-200 opacity-40 animate-ping" />
          <span className="absolute w-20 h-20 rounded-full bg-red-200 opacity-30 animate-ping [animation-delay:0.3s]" />
        </>
      )}
      {isSpeaking && (
        <span className="absolute w-24 h-24 rounded-full bg-purple-200 opacity-40 animate-pulse" />
      )}
      <button
        onClick={onStop}
        className={[
          "relative w-16 h-16 rounded-full flex items-center justify-center",
          "text-white shadow-lg transition-all duration-300",
          isListening ? "bg-red-500"
            : isSpeaking ? "bg-purple-500"
            : busy ? "bg-amber-400"
            : "bg-sky-500",
        ].join(" ")}
        aria-label="Sair do modo conversa"
      >
        {isSpeaking
          ? <SpeakerIcon />
          : busy
          ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <MicIcon />}
      </button>
    </div>
  );
}
