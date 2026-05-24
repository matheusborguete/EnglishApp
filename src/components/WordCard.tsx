"use client";

import type { WordInfo } from "@/lib/wordLookup";

interface WordCardProps {
  word: string;
  info: WordInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

const TYPE_PT: Record<string, string> = {
  noun: "substantivo",
  verb: "verbo",
  adjective: "adjetivo",
  adverb: "advérbio",
  phrase: "expressão",
  preposition: "preposição",
  conjunction: "conjunção",
  pronoun: "pronome",
};

export function WordCard({ word, info, loading, error, onClose }: WordCardProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-[fadeIn_0.15s_ease]"
        onClick={onClose}
      />

      {/* Card — slides up from bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl px-6 pt-5 pb-8 animate-[slideUp_0.2s_ease-out]">
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-5" />

        {loading && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Buscando tradução...</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-4">
            <p className="text-3xl mb-2">😕</p>
            <p className="text-sm text-gray-500">Não consegui traduzir essa palavra.</p>
          </div>
        )}

        {info && !loading && (
          <div>
            {/* Word + type */}
            <div className="flex items-baseline gap-3 mb-1">
              <h2 className="text-2xl font-bold text-gray-900">{info.word}</h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {TYPE_PT[info.type] ?? info.type}
              </span>
            </div>

            {/* Translation */}
            <p className="text-xl text-sky-600 font-semibold mb-4">{info.pt}</p>

            {/* Example */}
            <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3">
              <p className="text-xs text-sky-400 font-medium mb-1 uppercase tracking-wide">Exemplo</p>
              <p className="text-sm text-gray-700 italic leading-relaxed">{info.example}</p>
            </div>
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-5 w-full py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          Fechar
        </button>
      </div>
    </>
  );
}
