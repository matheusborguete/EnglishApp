"use client";

import type { Message } from "@/types";

interface ChatBubbleProps {
  message: Message;
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

export function ChatBubble({ message }: ChatBubbleProps) {
  const isAI = message.role === "assistant";
  const isEmpty = !message.content && message.isStreaming;

  // Hide the corrections JSON block from the chat UI
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
