"use client";

import type { VoiceState } from "@/types";

interface VoiceButtonProps {
  voiceState: VoiceState;
  isSupported: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

export function VoiceButton({ voiceState, isSupported, onStart, onStop, disabled }: VoiceButtonProps) {
  if (!isSupported) return null;

  const isListening = voiceState === "listening";
  const isSpeaking = voiceState === "speaking";
  const isProcessing = voiceState === "processing";

  const handleClick = () => {
    if (isListening) {
      onStop();
    } else if (!isSpeaking && !isProcessing) {
      onStart();
    }
  };

  let bgClass = "bg-sky-500 hover:bg-sky-600";
  let icon = <MicIcon />;
  let label = "Falar";
  let ring = "";

  if (isListening) {
    bgClass = "bg-red-500";
    icon = <StopIcon />;
    label = "Ouvindo...";
    ring = "ring-4 ring-red-300 animate-pulse";
  } else if (isSpeaking) {
    bgClass = "bg-purple-500 cursor-default";
    icon = <SpeakerIcon />;
    label = "Emma fala...";
  } else if (isProcessing) {
    bgClass = "bg-amber-500 cursor-wait";
    icon = <MicIcon />;
    label = "Processando...";
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={handleClick}
        disabled={disabled || isProcessing}
        aria-label={label}
        className={`w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-50 disabled:cursor-not-allowed ${bgClass} ${ring}`}
      >
        {icon}
      </button>
      <span className="text-[11px] text-gray-400 whitespace-nowrap">{label}</span>
    </div>
  );
}
