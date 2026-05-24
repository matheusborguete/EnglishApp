"use client";

import { useState, useRef } from "react";
import type { TopicId } from "@/types";
import { getTopicById } from "@/lib/topics";
import { translateToEnglish } from "@/lib/translate";

interface PhraseHelperProps {
  topicId: TopicId;
  onUsePhrase: (phrase: string) => void;
  onClose: () => void;
}

type Tab = "phrases" | "translate";

export function PhraseHelper({ topicId, onUsePhrase, onClose }: PhraseHelperProps) {
  const topic = getTopicById(topicId);
  const [tab, setTab] = useState<Tab>("phrases");

  // Translate tab state
  const [ptInput, setPtInput] = useState("");
  const [translations, setTranslations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleTranslate = async () => {
    const text = ptInput.trim();
    if (!text) return;
    setLoading(true);
    setError("");
    setTranslations([]);
    try {
      const result = await translateToEnglish(text);
      // Split "option 1 / option 2" into separate items
      setTranslations(result.split(" / ").map((s) => s.trim()).filter(Boolean));
    } catch {
      setError("Não consegui traduzir. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleTranslate();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[75vh]">
        {/* Handle */}
        <div className="flex-shrink-0 pt-4 pb-2 px-6">
          <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-900 text-center">💡 Preciso de ajuda</h2>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 flex border-b border-gray-100 px-4">
          <button
            onClick={() => setTab("phrases")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "phrases"
                ? "text-sky-600 border-b-2 border-sky-500"
                : "text-gray-400"
            }`}
          >
            Frases prontas
          </button>
          <button
            onClick={() => { setTab("translate"); setTimeout(() => inputRef.current?.focus(), 100); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === "translate"
                ? "text-sky-600 border-b-2 border-sky-500"
                : "text-gray-400"
            }`}
          >
            Como falo em inglês?
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Phrases tab ── */}
          {tab === "phrases" && (
            <div className="p-4 space-y-2">
              <p className="text-xs text-gray-400 text-center mb-3">
                Toque em uma frase para usá-la na conversa
              </p>
              {topic.phraseSuggestions.map((phrase) => (
                <button
                  key={phrase}
                  onClick={() => { onUsePhrase(phrase); onClose(); }}
                  className="w-full text-left px-4 py-3 rounded-2xl bg-sky-50 border border-sky-100 text-sky-800 text-sm hover:bg-sky-100 active:scale-95 transition-all"
                >
                  {phrase}
                </button>
              ))}
            </div>
          )}

          {/* ── Translate tab ── */}
          {tab === "translate" && (
            <div className="p-4">
              <p className="text-xs text-gray-400 text-center mb-4">
                Escreva em português o que quer dizer
              </p>

              {/* Input */}
              <div className="flex gap-2 mb-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={ptInput}
                  onChange={(e) => setPtInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ex: gosto de séries de suspense"
                  className="flex-1 border border-gray-200 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-gray-50"
                />
                <button
                  onClick={handleTranslate}
                  disabled={!ptInput.trim() || loading}
                  className="px-4 py-2.5 bg-sky-500 text-white rounded-2xl text-sm font-medium disabled:opacity-40 hover:bg-sky-600 transition-colors"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : "Traduzir"}
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-xs text-center mb-3">{error}</p>
              )}

              {/* Results */}
              {translations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-2">Toque para usar na conversa:</p>
                  {translations.map((t) => (
                    <button
                      key={t}
                      onClick={() => { onUsePhrase(t); onClose(); }}
                      className="w-full text-left px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm font-medium hover:bg-emerald-100 active:scale-95 transition-all"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}

              {!loading && translations.length === 0 && !error && ptInput && (
                <p className="text-xs text-gray-400 text-center">
                  Pressione Traduzir ↑
                </p>
              )}

              {!ptInput && (
                <div className="mt-6 space-y-2">
                  <p className="text-xs text-gray-400 text-center mb-3">Exemplos:</p>
                  {[
                    "gosto de séries de suspense",
                    "estou animada para a viagem",
                    "não entendi a pergunta",
                    "pode repetir mais devagar?",
                  ].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => { setPtInput(ex); inputRef.current?.focus(); }}
                      className="w-full text-left px-4 py-2 rounded-xl bg-gray-50 border border-gray-100 text-gray-500 text-sm hover:bg-gray-100 transition-colors"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Close */}
        <div className="flex-shrink-0 px-4 pb-6 pt-2">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gray-100 text-gray-600 text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </>
  );
}
