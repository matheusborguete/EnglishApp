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
  expression: "expressão",
  preposition: "preposição",
  conjunction: "conjunção",
  pronoun: "pronome",
};

function typeLabel(type: string) {
  const lower = type.toLowerCase();
  for (const [key, val] of Object.entries(TYPE_PT)) {
    if (lower.includes(key)) return val;
  }
  return type;
}

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
          <div className="space-y-4">
            {/* Word + type */}
            <div className="flex items-baseline gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{info.word}</h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {typeLabel(info.type)}
              </span>
            </div>

            {/* Contextual meaning — most prominent */}
            <div className="bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
              <p className="text-[10px] text-sky-400 font-semibold uppercase tracking-wider mb-1">
                Nessa frase
              </p>
              {info.contextPhrase.toLowerCase() !== info.word.toLowerCase() && (
                <p className="text-xs text-sky-500 font-medium mb-1 italic">
                  "{info.contextPhrase}"
                </p>
              )}
              <p className="text-xl font-bold text-sky-700">{info.contextPt}</p>
            </div>

            {/* Other meanings */}
            {info.otherMeanings?.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">
                  Outros usos
                </p>
                <div className="space-y-2">
                  {info.otherMeanings.map((m, i) => (
                    <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-800">{m.pt}</span>
                        <span className="text-[10px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-full">
                          {typeLabel(m.type)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 italic">{m.example}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
