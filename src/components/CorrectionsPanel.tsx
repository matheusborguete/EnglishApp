"use client";

import type { CorrectionNote } from "@/types";

const CATEGORY_STYLES: Record<string, string> = {
  grammar: "bg-red-50 text-red-700 border-red-200",
  tense: "bg-orange-50 text-orange-700 border-orange-200",
  vocabulary: "bg-blue-50 text-blue-700 border-blue-200",
  preposition: "bg-purple-50 text-purple-700 border-purple-200",
  idiom: "bg-green-50 text-green-700 border-green-200",
};

const CATEGORY_PT: Record<string, string> = {
  grammar: "gramática",
  tense: "tempo verbal",
  vocabulary: "vocabulário",
  preposition: "preposição",
  idiom: "expressão",
};

interface CorrectionsPanelProps {
  corrections: CorrectionNote[];
  summary: string;
  topicTitle: string;
  messageCount: number;
  onNewTopic: () => void;
  onSameTopic: () => void;
}

export function CorrectionsPanel({
  corrections,
  summary,
  topicTitle,
  messageCount,
  onNewTopic,
  onSameTopic,
}: CorrectionsPanelProps) {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎉</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Ótima conversa!</h1>
          <p className="text-gray-500 text-sm">
            {topicTitle} · {messageCount} mensagem{messageCount !== 1 ? "s" : ""} enviadas
          </p>
          {summary && (
            <p className="mt-3 text-sky-700 bg-sky-50 border border-sky-200 px-4 py-2 rounded-xl text-sm italic">
              &quot;{summary}&quot;
            </p>
          )}
        </div>

        {/* What went well */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-emerald-600 text-lg">✓</span>
            <span className="font-semibold text-emerald-700 text-sm">
              Você completou uma conversa em inglês!
            </span>
          </div>
          <p className="text-gray-600 text-sm leading-relaxed">
            Cada conversa que você termina constrói fluência real. Quanto mais você falar,
            menos vai precisar traduzir mentalmente.
          </p>
        </div>

        {/* Corrections */}
        {corrections.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sky-500 text-lg">📈</span>
              <h2 className="font-semibold text-gray-900 text-sm">
                {corrections.length} ponto{corrections.length !== 1 ? "s" : ""} para melhorar
              </h2>
            </div>
            <div className="space-y-4">
              {corrections.map((note, idx) => (
                <div key={idx} className="border-l-2 border-sky-200 pl-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      CATEGORY_STYLES[note.category] ?? "bg-gray-50 text-gray-600 border-gray-200"
                    }`}
                  >
                    {CATEGORY_PT[note.category] ?? note.category}
                  </span>
                  <p className="text-xs text-gray-400 line-through mt-1.5">&quot;{note.original}&quot;</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">&quot;{note.improved}&quot;</p>
                  <p className="text-xs text-gray-400 mt-0.5">{note.rule}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 text-center">
            <p className="text-4xl mb-2">⭐</p>
            <p className="text-sm font-medium text-gray-800">Sem correções desta vez!</p>
            <p className="text-xs text-gray-400 mt-1">Você foi muito precisa hoje.</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onSameTopic}
            className="flex-1 py-3 rounded-2xl border-2 border-sky-200 text-sky-600 font-medium text-sm hover:bg-sky-50 transition-colors"
          >
            Mesmo tópico
          </button>
          <button
            onClick={onNewTopic}
            className="flex-1 py-3 rounded-2xl bg-sky-500 text-white font-medium text-sm hover:bg-sky-600 transition-colors"
          >
            Novo tópico
          </button>
        </div>
      </div>
    </div>
  );
}
