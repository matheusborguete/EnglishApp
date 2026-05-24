"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceState } from "@/types";

interface UseVoiceReturn {
  voiceState: VoiceState;
  isSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  clearTranscript: () => void;
}

export function useVoice(onTranscriptFinal: (text: string) => void): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Stable callback ref to avoid hook dependency churn
  const callbackRef = useRef(onTranscriptFinal);
  useEffect(() => {
    callbackRef.current = onTranscriptFinal;
  });

  useEffect(() => {
    const SpeechRecognitionAPI =
      window.SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionAPI || !window.speechSynthesis) return;

    setIsSupported(true);
    synthRef.current = window.speechSynthesis;

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
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      setTranscript(finalText || interimText);
      if (finalText) {
        setVoiceState("processing");
        callbackRef.current(finalText.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech") {
        console.warn("Speech recognition error:", event.error);
        setVoiceState("error");
      } else {
        setVoiceState("idle");
      }
      setTranscript("");
    };

    recognition.onend = () => {
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
    try {
      recognitionRef.current.start();
    } catch {
      // Already started — ignore
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceState("idle");
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const cleanText = text
      .replace(/<corrections>[\s\S]*?<\/corrections>/g, "")
      .replace(/\[END_SESSION\]/g, "")
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    const selectVoice = () => {
      if (!synthRef.current) return;
      const voices = synthRef.current.getVoices();
      const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
      const preferred =
        englishVoices.find(
          (v) =>
            v.name.includes("Samantha") ||
            v.name.includes("Google US English") ||
            v.name.includes("Microsoft Aria") ||
            v.name.includes("Karen") ||
            v.name.includes("Zira")
        ) ?? englishVoices[0];
      if (preferred) utterance.voice = preferred;
    };

    if (synthRef.current.getVoices().length > 0) {
      selectVoice();
    } else {
      synthRef.current.onvoiceschanged = selectVoice;
    }

    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    utterance.onerror = () => setVoiceState("idle");

    setVoiceState("speaking");
    synthRef.current.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    setVoiceState("idle");
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return {
    voiceState,
    isSupported,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearTranscript,
  };
}
