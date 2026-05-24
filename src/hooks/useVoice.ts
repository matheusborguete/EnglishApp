"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceState } from "@/types";

interface UseVoiceOptions {
  onTranscriptFinal: (text: string) => void;
  /** Chamado quando TTS termina — usado pelo modo conversa para auto-religar o mic */
  onSpeechEnd?: () => void;
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
  /** Call directly inside a touch/click handler to unlock iOS TTS for the session */
  unlockTTS: () => void;
}

export function useVoice({ onTranscriptFinal, onSpeechEnd }: UseVoiceOptions): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSTTSupported, setIsSTTSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const onTranscriptRef = useRef(onTranscriptFinal);
  const onSpeechEndRef = useRef(onSpeechEnd);
  useEffect(() => { onTranscriptRef.current = onTranscriptFinal; });
  useEffect(() => { onSpeechEndRef.current = onSpeechEnd; });

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
    recognition.continuous = false;
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
        setVoiceState("processing");
        onTranscriptRef.current(final.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") console.warn("STT error:", event.error);
      setVoiceState("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      // Only snap back to idle if still in listening (not processing/speaking)
      setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    synthRef.current?.cancel();
    setVoiceState("idle");
    setTranscript("");
    // Small delay to let cancel propagate
    setTimeout(() => {
      try { recognitionRef.current?.start(); } catch { /* already started */ }
    }, 80);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceState("idle");
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

    // Split into sentences and queue each one for natural pacing
    const sentences = clean
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    sentences.forEach((sentence, idx) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = "en-US";
      utterance.rate = 0.92;
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

  /**
   * iOS Safari blocks programmatic TTS unless it's triggered within a user
   * gesture. Call this function synchronously inside any onClick/onSubmit
   * handler BEFORE the async chain begins. The silent utterance "unlocks"
   * speechSynthesis for the rest of the session.
   */
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
