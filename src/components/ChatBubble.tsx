"use client";

import type { Message } from "@/types";

interface ChatBubbleProps {
  message: Message;
  onWordTap?: (word: string) => void;
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

/** Renders AI text with each word as a tappable button. */
function ClickableText({
  text,
  onWordTap,
}: {
  text: string;
  onWordTap: (word: string) => void;
}) {
  // Split preserving spaces and line breaks
  const tokens = text.split(/(\s+)/);

  return (
    <>
      {tokens.map((token, i) => {
        // Whitespace — render as-is
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;

        // Strip leading/trailing punctuation to get the pure word
        const word = token.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "");
        if (!word) return <span key={i}>{token}</span>;

        // Prefix/suffix punctuation preserved visually
        const prefix = token.slice(0, token.indexOf(word[0]));
        const suffix = token.slice(token.indexOf(word[0]) + word.length);

        return (
          <span key={i}>
            {prefix}
            <button
              onClick={() => onWordTap(word)}
              className="underline decoration-dotted decoration-sky-300 underline-offset-2 hover:text-sky-600 active:bg-sky-100 rounded transition-colors cursor-pointer"
              aria-label={`Translate: ${word}`}
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

export function ChatBubble({ message, onWordTap }: ChatBubbleProps) {
  const isAI = message.role === "assistant";
  const isEmpty = !message.content && message.isStreaming;

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

      <div
        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
          isAI
            ? "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"
            : "bg-sky-500 text-white rounded-br-sm"
        }`}
      >
        {isEmpty ? (
          <TypingIndicator />
        ) : isAI && !message.isStreaming && onWordTap ? (
          // Completed AI message — words are tappable
          <>
            <ClickableText text={displayContent} onWordTap={onWordTap} />
            <p className="text-[10px] text-gray-300 mt-1.5">Toque em uma palavra para ver o significado</p>
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

      {!isAI && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold flex-shrink-0 mb-1">
          Você
        </div>
      )}
    </div>
  );
}
