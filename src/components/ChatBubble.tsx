"use client";

import type { Message } from "@/types";

interface ChatBubbleProps {
  message: Message;
  onWordTap?: (word: string, context: string) => void;
  onSpeak?: () => void;
  isSpeaking?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-sky-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const StopIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

function ClickableText({
  text,
  onWordTap,
}: {
  text: string;
  onWordTap: (word: string, context: string) => void;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
        const word = token.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "");
        if (!word) return <span key={i}>{token}</span>;
        const prefix = token.slice(0, token.indexOf(word[0]));
        const suffix = token.slice(token.indexOf(word[0]) + word.length);
        return (
          <span key={i}>
            {prefix}
            <button
              onClick={() => onWordTap(word, text)}
              className="underline decoration-dotted decoration-sky-300 underline-offset-2 hover:text-sky-600 active:bg-sky-100 rounded transition-colors cursor-pointer"
            >
              {word}
            </button>
            {suffix}
          </span>
        );
      })}
    </>
  );
}

export function ChatBubble({ message, onWordTap, onSpeak, isSpeaking }: ChatBubbleProps) {
  const isAI = message.role === "assistant";
  const isEmpty = !message.content && message.isStreaming;
  const isComplete = isAI && !message.isStreaming && !!message.content;

  const displayContent = message.content
    .replace(/<corrections>[\s\S]*?<\/corrections>/g, "")
    .trim();

  return (
    <div className={`flex items-end gap-2 mb-4 ${isAI ? "justify-start" : "justify-end"}`}>
      {isAI && (
        <div className="w-8 h-8 rounded-full bg-sky-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mb-1">
          E
        </div>
      )}

      <div className="max-w-[78%] flex flex-col gap-1">
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAI
              ? "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"
              : "bg-sky-500 text-white rounded-br-sm"
          }`}
        >
          {isEmpty ? (
            <TypingIndicator />
          ) : isComplete && onWordTap ? (
            <>
              <ClickableText text={displayContent} onWordTap={onWordTap} />
              <p className="text-[10px] text-gray-300 mt-1.5">
                Toque numa palavra para ver o significado
              </p>
            </>
          ) : (
            <>
              {displayContent}
              {message.isStreaming && (
                <span className="inline-block w-1 h-4 bg-current ml-0.5 animate-pulse align-middle rounded-sm" />
              )}
            </>
          )}
        </div>

        {/* Play / stop button — AI messages and user messages (pronunciation) */}
        {onSpeak && !message.isStreaming && message.content && (
          <button
            onClick={onSpeak}
            className={[
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
              isAI ? "self-start" : "self-end",
              isSpeaking
                ? "bg-purple-100 text-purple-600 border border-purple-200"
                : isAI
                ? "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-sky-50 hover:text-sky-600 hover:border-sky-200"
                : "bg-sky-100 text-sky-700 border border-sky-200 hover:bg-sky-200",
            ].join(" ")}
          >
            {isSpeaking ? <StopIcon /> : <PlayIcon />}
            {isSpeaking ? "Parar" : isAI ? "Ouvir Emma" : "Ouvir pronúncia"}
          </button>
        )}
      </div>

      {!isAI && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0 mb-1">
          Você
        </div>
      )}
    </div>
  );
}
