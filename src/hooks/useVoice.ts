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
  // Prevents onend from double-sending after fireTranscript already sent.
  const transcriptFiredRef = useRef(false);

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
      transcriptFiredRef.current = true; // tell onend not to double-send
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
      // Read the ENTIRE results list as the canonical source of truth.
      // Some Android engines re-fire the same resultIndex with a longer text
      // (e.g. "I" → "I spend" → "I spend my day") instead of appending new
      // segments. Iterating from 0 and REPLACING the buffer avoids duplicates.
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += (finalText ? " " : "") + r[0].transcript.trim();
        else interimText += r[0].transcript;
      }

      if (finalText) {
        // Replace, not push — the full list already contains the correct text.
        finalBufferRef.current = [finalText];

        // CONVERSATION MODE ONLY: schedule auto-send after silence.
        if (autoSendRef.current) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(
            () => fireTranscript(),
            finalDebounceRef.current,
          );
        }
      }

      // Show finals + current in-progress interim so the display never shrinks.
      setTranscript(interimText
        ? (finalText ? finalText + " " + interimText : interimText)
        : finalText);
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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // fireTranscript() already sent and flagged this — don't double-send.
      if (transcriptFiredRef.current) {
        transcriptFiredRef.current = false;
        finalBufferRef.current = [];
        setTranscript("");
        setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
        return;
      }

      // Manual stop path: flush whatever accumulated in the buffer.
      const buffered = finalBufferRef.current.join(" ").trim();
      finalBufferRef.current = [];
      setTranscript("");
      if (buffered) {
        setVoiceState("processing");
        onTranscriptRef.current(buffered);
      } else {
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
    synthRef.current?.cancel();
    finalBufferRef.current = [];
    transcriptFiredRef.current = false;
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
