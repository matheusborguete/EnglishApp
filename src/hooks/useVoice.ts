"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceState } from "@/types";

interface UseVoiceReturn {
  voiceState: VoiceState;
  isSTTSupported: boolean;
  isTTSSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  /** Feed streaming tokens — speaks sentence-by-sentence as they arrive */
  feedChunk: (chunk: string) => void;
  /** Call when streaming is done to flush any remaining text */
  flushSpeech: () => void;
  /** Speak a full string at once */
  speak: (text: string) => void;
  stopSpeaking: () => void;
  clearTranscript: () => void;
}

const SENTENCE_END = /[.!?]+\s+/;

export function useVoice(onTranscriptFinal: (text: string) => void): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSTTSupported, setIsSTTSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const ttsBuffer = useRef("");
  const isSpeakingRef = useRef(false);

  const callbackRef = useRef(onTranscriptFinal);
  useEffect(() => { callbackRef.current = onTranscriptFinal; });

  // Select preferred English voice
  const getEnglishVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    const voices = synthRef.current?.getVoices() ?? [];
    const en = voices.filter((v) => v.lang.startsWith("en"));
    return (
      en.find((v) =>
        v.name.includes("Samantha") ||
        v.name.includes("Google US English") ||
        v.name.includes("Microsoft Aria") ||
        v.name.includes("Karen") ||
        v.name.includes("Zira")
      ) ?? en[0]
    );
  }, []);

  const enqueueSentence = useCallback((text: string) => {
    if (!synthRef.current || !text.trim()) return;

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = "en-US";
    utterance.rate = 0.92;

    const voice = getEnglishVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setVoiceState("speaking");
    };
    utterance.onend = () => {
      // Check if synth queue is empty
      if (!synthRef.current?.speaking) {
        isSpeakingRef.current = false;
        setVoiceState("idle");
      }
    };
    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setVoiceState("idle");
    };

    synthRef.current.speak(utterance);
  }, [getEnglishVoice]);

  useEffect(() => {
    // TTS setup
    if (window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      setIsTTSSupported(true);
      // Warm up voice list (async on some browsers)
      const loadVoices = () => window.speechSynthesis.getVoices();
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    // STT setup
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
    isSpeakingRef.current = false;
    ttsBuffer.current = "";
    try {
      recognitionRef.current.start();
    } catch {
      // Already started
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setVoiceState("idle");
  }, []);

  /** Feed a streaming chunk — queues TTS as each sentence completes */
  const feedChunk = useCallback((chunk: string) => {
    ttsBuffer.current += chunk;

    // Detect sentence boundaries and speak immediately
    let match;
    while ((match = SENTENCE_END.exec(ttsBuffer.current)) !== null) {
      const sentence = ttsBuffer.current.slice(0, match.index + match[0].length);
      ttsBuffer.current = ttsBuffer.current.slice(match.index + match[0].length);
      const clean = sentence.replace(/<corrections>[\s\S]*?<\/corrections>/g, "").trim();
      if (clean) enqueueSentence(clean);
    }
  }, [enqueueSentence]);

  /** Flush remaining buffered text after streaming ends */
  const flushSpeech = useCallback(() => {
    const remaining = ttsBuffer.current
      .replace(/<corrections>[\s\S]*?<\/corrections>/g, "")
      .trim();
    ttsBuffer.current = "";
    if (remaining) enqueueSentence(remaining);
  }, [enqueueSentence]);

  /** Speak a full string at once (for the opening message) */
  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    isSpeakingRef.current = false;
    ttsBuffer.current = "";

    const clean = text.replace(/<corrections>[\s\S]*?<\/corrections>/g, "").trim();
    if (!clean) return;

    // Split into sentences and enqueue each
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    sentences.forEach((s) => enqueueSentence(s));
  }, [enqueueSentence]);

  const stopSpeaking = useCallback(() => {
    synthRef.current?.cancel();
    isSpeakingRef.current = false;
    ttsBuffer.current = "";
    setVoiceState("idle");
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return {
    voiceState,
    isSTTSupported,
    isTTSSupported,
    transcript,
    startListening,
    stopListening,
    feedChunk,
    flushSpeech,
    speak,
    stopSpeaking,
    clearTranscript,
  };
}
