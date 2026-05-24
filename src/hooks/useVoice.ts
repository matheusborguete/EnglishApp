"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceState } from "@/types";

interface UseVoiceOptions {
  onTranscriptFinal: (text: string) => void;
  /** Called when TTS ends — used by conversation mode to restart the mic. */
  onSpeechEnd?: () => void;
  /**
   * MANUAL mode (false, default): user controls when to send by calling
   * stopListening(). No auto-send via debounce.
   *
   * CONVERSATION mode (true): automatically sends after the user stops speaking
   * for `finalDebounceMs`. Recognition stops itself after sending; the
   * onSpeechEnd callback is responsible for restarting it.
   */
  autoSend?: boolean;
  /** Silence duration (ms) before auto-sending in conversation mode. */
  finalDebounceMs?: number;
  /** TTS speech rate, 0–2. Lower = easier for learners. */
  speechRate?: number;
}

interface UseVoiceReturn {
  voiceState: VoiceState;
  isSTTSupported: boolean;
  isTTSSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  resetToIdle: () => void;
  unlockTTS: () => void;
}

export function useVoice({
  onTranscriptFinal,
  onSpeechEnd,
  autoSend = false,
  finalDebounceMs = 800,
  speechRate = 0.92,
}: UseVoiceOptions): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSTTSupported, setIsSTTSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Keep mutable refs so the recognition event handlers (set up once) always
  // see the latest values without needing to re-register.
  const onTranscriptRef = useRef(onTranscriptFinal);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const autoSendRef = useRef(autoSend);
  const finalDebounceRef = useRef(finalDebounceMs);
  const speechRateRef = useRef(speechRate);
  useEffect(() => { onTranscriptRef.current = onTranscriptFinal; });
  useEffect(() => { onSpeechEndRef.current = onSpeechEnd; });
  useEffect(() => { autoSendRef.current = autoSend; }, [autoSend]);
  useEffect(() => { finalDebounceRef.current = finalDebounceMs; }, [finalDebounceMs]);
  useEffect(() => { speechRateRef.current = speechRate; }, [speechRate]);

  // Accumulated final-result segments and the conversation-mode debounce timer.
  const finalBufferRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Sends whatever is in the buffer. Stops the recognition so it doesn't keep
   * running after a send (conversation mode restarts it via onSpeechEnd).
   * Safe to call with an empty buffer — it just clears state.
   */
  const fireTranscript = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const text = finalBufferRef.current.join(" ").trim();
    finalBufferRef.current = [];
    setTranscript("");
    if (text) {
      // Stop recognition; onend will see an empty buffer and won't double-send.
      recognitionRef.current?.stop();
      setVoiceState("processing");
      onTranscriptRef.current(text);
    }
  }, []);

  const getEnglishVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = synthRef.current?.getVoices() ?? [];
    const en = voices.filter((v) => v.lang.startsWith("en"));
    return (
      en.find((v) =>
        v.name.includes("Samantha") ||
        v.name.includes("Google US English") ||
        v.name.includes("Microsoft Aria") ||
        v.name.includes("Karen") ||
        v.name.includes("Zira") ||
        v.name.includes("Daniel")
      ) ?? en[0] ?? null
    );
  }, []);

  useEffect(() => {
    // ── TTS init ──
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      setIsTTSSupported(true);
      const loadVoices = () => window.speechSynthesis.getVoices();
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // ── STT init ──
    const SpeechRecognitionAPI =
      window.SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) return;
    setIsSTTSupported(true);

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.continuous = true;   // keeps mic open through natural pauses
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceState("listening");
      setTranscript("");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTranscript(final || interim);

      if (final.trim()) {
        finalBufferRef.current.push(final.trim());

        // CONVERSATION MODE ONLY: schedule auto-send after silence.
        // In manual mode (autoSend = false) the buffer accumulates until
        // stopListening() is called and onend flushes it.
        if (autoSendRef.current) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(
            () => fireTranscript(),
            finalDebounceRef.current,
          );
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") console.warn("STT error:", event.error);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      finalBufferRef.current = [];
      setVoiceState("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      // Cancel any pending debounce (shouldn't happen but be safe).
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Flush whatever is in the buffer. In manual mode this is the primary
      // send path. In conversation mode fireTranscript() clears the buffer
      // before calling stop(), so this branch is usually a no-op.
      const buffered = finalBufferRef.current.join(" ").trim();
      finalBufferRef.current = [];
      setTranscript("");
      if (buffered) {
        setVoiceState("processing");
        onTranscriptRef.current(buffered);
      } else {
        // Don't clobber "processing" or "speaking" set by fireTranscript/speak.
        setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      recognition.abort();
      window.speechSynthesis?.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    // Cancel TTS so we don't record Emma's own voice.
    synthRef.current?.cancel();
    // Reset buffer state.
    finalBufferRef.current = [];
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setVoiceState("idle");
    setTranscript("");
    // Small delay lets the TTS cancel propagate and avoids "already started" errors.
    setTimeout(() => {
      try { recognitionRef.current?.start(); } catch { /* already started */ }
    }, 80);
  }, []);

  /** Manual stop: flushes buffer via onend. */
  const stopListening = useCallback(() => {
    // Cancel any pending auto-send; onend will flush the buffer.
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    // Don't reset voiceState here — onend will handle it.
    setTranscript("");
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const clean = text
      .replace(/<corrections>[\s\S]*?<\/corrections>/g, "")
      .replace(/\[END_SESSION\]/g, "")
      .trim();

    if (!clean) return;

    const sentences = clean
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    sentences.forEach((sentence, idx) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "en-US";
      utterance.rate = speechRateRef.current;
      utterance.pitch = 1.05;

      const voice = getEnglishVoice();
      if (voice) utterance.voice = voice;

      if (idx === 0) {
        utterance.onstart = () => setVoiceState("speaking");
      }
      if (idx === sentences.length - 1) {
        utterance.onend = () => {
          setVoiceState("idle");
          onSpeechEndRef.current?.();
        };
        utterance.onerror = () => {
          setVoiceState("idle");
          onSpeechEndRef.current?.();
        };
      }

      synthRef.current!.speak(utterance);
    });
  }, [getEnglishVoice]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setVoiceState("idle");
  }, []);

  const resetToIdle = useCallback(() => {
    setVoiceState("idle");
    setTranscript("");
  }, []);

  const unlockTTS = useCallback(() => {
    if (!synthRef.current) return;
    const silence = new SpeechSynthesisUtterance("");
    silence.volume = 0;
    synthRef.current.speak(silence);
  }, []);

  return {
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
  };
}
