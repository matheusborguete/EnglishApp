"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceState } from "@/types";

interface UseVoiceOptions {
  onTranscriptFinal: (text: string) => void;
  /** Called when TTS ends — used by conversation mode to auto-restart mic */
  onSpeechEnd?: () => void;
  /**
   * How long (ms) to wait after the last speech segment before sending.
   * Higher = more forgiving of slow/pausing speakers. Default 600ms.
   */
  finalDebounceMs?: number;
  /** TTS speech rate, 0–2. Default 0.92. Lower = easier to follow. */
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
  clearTranscript: () => void;
  unlockTTS: () => void;
}

export function useVoice({
  onTranscriptFinal,
  onSpeechEnd,
  finalDebounceMs = 600,
  speechRate = 0.92,
}: UseVoiceOptions): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSTTSupported, setIsSTTSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const onTranscriptRef = useRef(onTranscriptFinal);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const finalDebounceRef = useRef(finalDebounceMs);
  const speechRateRef = useRef(speechRate);
  useEffect(() => { onTranscriptRef.current = onTranscriptFinal; });
  useEffect(() => { onSpeechEndRef.current = onSpeechEnd; });
  useEffect(() => { finalDebounceRef.current = finalDebounceMs; });
  useEffect(() => { speechRateRef.current = speechRate; });

  // Accumulated final transcript segments and debounce timer
  const finalBufferRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireTranscript = useCallback(() => {
    debounceTimerRef.current = null;
    const text = finalBufferRef.current.join(" ").trim();
    finalBufferRef.current = [];
    if (text) {
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
    // TTS init
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      setIsTTSSupported(true);
      const loadVoices = () => window.speechSynthesis.getVoices();
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // STT init
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
        // Reset debounce window on each new speech segment
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(fireTranscript, finalDebounceRef.current);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") console.warn("STT error:", event.error);
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
      finalBufferRef.current = [];
      setVoiceState("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      // Flush any buffered text that hasn't been sent yet (e.g. when stopListening fires)
      if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
      const buffered = finalBufferRef.current.join(" ").trim();
      finalBufferRef.current = [];
      if (buffered) {
        setVoiceState("processing");
        onTranscriptRef.current(buffered);
      } else {
        setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
      }
      setTranscript("");
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
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    setVoiceState("idle");
    setTranscript("");
    setTimeout(() => {
      try { recognitionRef.current?.start(); } catch { /* already started */ }
    }, 80);
  }, []);

  const stopListening = useCallback(() => {
    // Cancel any pending debounce — onend will flush the buffer
    if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
    recognitionRef.current?.stop();
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

  const clearTranscript = useCallback(() => setTranscript(""), []);

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
    clearTranscript,
    unlockTTS,
  };
}
