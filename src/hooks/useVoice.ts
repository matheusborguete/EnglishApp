"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceState } from "@/types";

interface UseVoiceOptions {
  onTranscriptFinal: (text: string) => void;
  onSpeechEnd?: () => void;
  /**
   * MANUAL mode (false, default): user controls when to send.
   *   - Recognition uses continuous=false.
   *   - After each natural utterance end, the mic restarts automatically so
   *     the user can keep speaking across pauses.
   *   - The accumulated buffer is sent only when the user explicitly stops
   *     (calls stopListening).
   *
   * CONVERSATION mode (true): mic fires once per utterance and sends
   *   immediately. The onSpeechEnd callback is responsible for restarting
   *   the mic after Emma responds.
   */
  autoSend?: boolean;
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
  speechRate = 0.92,
}: UseVoiceOptions): UseVoiceReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isSTTSupported, setIsSTTSupported] = useState(false);
  const [isTTSSupported, setIsTTSSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Refs so event handlers set up once always see the latest values.
  const onTranscriptRef = useRef(onTranscriptFinal);
  const onSpeechEndRef  = useRef(onSpeechEnd);
  const autoSendRef     = useRef(autoSend);
  const speechRateRef   = useRef(speechRate);
  useEffect(() => { onTranscriptRef.current = onTranscriptFinal; });
  useEffect(() => { onSpeechEndRef.current  = onSpeechEnd; });
  useEffect(() => { autoSendRef.current     = autoSend; },     [autoSend]);
  useEffect(() => { speechRateRef.current   = speechRate; },   [speechRate]);

  // ── Manual-mode state ────────────────────────────────────────────────────
  // Buffer accumulates one clean segment per utterance (continuous=false
  // ensures each onresult fires once per utterance with no growing duplicates).
  const finalBufferRef   = useRef<string[]>([]);
  // Set to true by stopListening() so onend knows the user explicitly stopped.
  const userStoppedRef   = useRef(false);
  // Pending auto-restart timer (cancelled if user stops during the gap).
  const restartTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the recording session is logically "open" (user hasn't stopped).
  const sessionActiveRef = useRef(false);
  // True between onstart and onend — used to detect the restart gap where
  // recognition.stop() won't trigger onend, so stopListening can flush the
  // buffer immediately without waiting for an event that will never arrive.
  const recognitionRunningRef = useRef(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const scheduleRestart = () => {
    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      if (!sessionActiveRef.current) return;
      try { recognitionRef.current?.start(); } catch { /* already running */ }
    }, 100);
  };

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

  // ── Recognition setup (once) ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      setIsTTSSupported(true);
      const loadVoices = () => window.speechSynthesis.getVoices();
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    const SpeechRecognitionAPI =
      window.SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) return;
    setIsSTTSupported(true);

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    // continuous = false: each session captures one clean utterance.
    // Android Chrome with continuous=true re-fires the same text growing
    // across multiple result indices, causing "I I spend I spend my…" duplicates.
    // With continuous=false every onresult has exactly ONE final result
    // containing only the text for that utterance — no accumulation bugs.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      recognitionRunningRef.current = true;
      setVoiceState("listening");
      // Don't clear transcript here — manual mode shows accumulated text.
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // With continuous=false there is at most one result per session.
      // Read only from event.resultIndex (the newly changed result).
      let interim = "";
      let final  = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final  += event.results[i][0].transcript;
        else                           interim += event.results[i][0].transcript;
      }

      if (final.trim()) {
        if (autoSendRef.current) {
          // CONVERSATION MODE: send this utterance immediately.
          setTranscript("");
          setVoiceState("processing");
          onTranscriptRef.current(final.trim());
        } else {
          // MANUAL MODE: accumulate; send when user explicitly stops.
          finalBufferRef.current.push(final.trim());
          // Show full accumulated text so it never shrinks mid-session.
          setTranscript(finalBufferRef.current.join(" "));
        }
      } else {
        // Show accumulated finals + current in-progress interim.
        const accumulated = finalBufferRef.current.join(" ");
        setTranscript(accumulated ? accumulated + " " + interim : interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      recognitionRunningRef.current = false;
      if (event.error === "no-speech") {
        // Timeout with no speech — restart if session is still active (both modes).
        if (sessionActiveRef.current) {
          scheduleRestart();
        }
        return;
      }
      console.warn("STT error:", event.error);
      sessionActiveRef.current = false;
      clearRestartTimer();
      finalBufferRef.current = [];
      setVoiceState("idle");
      setTranscript("");
    };

    recognition.onend = () => {
      recognitionRunningRef.current = false;
      if (autoSendRef.current) {
        // CONVERSATION MODE: onresult already handled sending.
        // Always reset to idle so the state machine is in a clean position
        // for the next startListening() call.
        setVoiceState("idle");
        return;
      }

      // MANUAL MODE
      if (userStoppedRef.current) {
        // User pressed stop — flush buffer and send.
        userStoppedRef.current = false;
        sessionActiveRef.current = false;
        clearRestartTimer();
        const text = finalBufferRef.current.join(" ").trim();
        finalBufferRef.current = [];
        setTranscript("");
        if (text) {
          setVoiceState("processing");
          onTranscriptRef.current(text);
        } else {
          setVoiceState("idle");
        }
      } else if (sessionActiveRef.current) {
        // Natural utterance end — stay in "listening" so the restart is
        // invisible (WhatsApp-style: mic stays active across pauses).
        scheduleRestart();
      } else {
        setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
      }
    };

    recognitionRef.current = recognition;

    return () => {
      sessionActiveRef.current = false;
      clearRestartTimer();
      recognition.abort();
      window.speechSynthesis?.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    synthRef.current?.cancel();
    clearRestartTimer();
    finalBufferRef.current = [];
    userStoppedRef.current = false;
    sessionActiveRef.current = true;
    setTranscript("");
    setVoiceState("idle");
    setTimeout(() => {
      if (!sessionActiveRef.current) return;
      try { recognitionRef.current?.start(); } catch { /* already running */ }
    }, 80);
  }, []);

  const stopListening = useCallback(() => {
    clearRestartTimer();
    sessionActiveRef.current = false;
    if (recognitionRunningRef.current) {
      // Recognition is active — stop() will trigger onend which flushes the buffer.
      userStoppedRef.current = true;
      recognitionRef.current?.stop();
    } else {
      // Recognition is not running (restart gap or never started).
      // onend won't fire, so flush the buffer immediately.
      userStoppedRef.current = false;
      const text = finalBufferRef.current.join(" ").trim();
      finalBufferRef.current = [];
      setTranscript("");
      if (text) {
        setVoiceState("processing");
        onTranscriptRef.current(text);
      } else {
        setVoiceState("idle");
      }
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const clean = text
      .replace(/<corrections>[\s\S]*?<\/corrections>/g, "")
      .replace(/\[END_SESSION\]/g, "")
      .trim();
    if (!clean) return;

    const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

    sentences.forEach((sentence, idx) => {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang  = "en-US";
      utterance.rate  = speechRateRef.current;
      utterance.pitch = 1.05;
      const voice = getEnglishVoice();
      if (voice) utterance.voice = voice;

      if (idx === 0) {
        utterance.onstart = () => setVoiceState("speaking");
      }
      if (idx === sentences.length - 1) {
        utterance.onend  = () => { setVoiceState("idle"); onSpeechEndRef.current?.(); };
        utterance.onerror = () => { setVoiceState("idle"); onSpeechEndRef.current?.(); };
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
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    synthRef.current.speak(u);
  }, []);

  return {
    voiceState, isSTTSupported, isTTSSupported,
    transcript, startListening, stopListening,
    speak, stopSpeaking, resetToIdle, unlockTTS,
  };
}
