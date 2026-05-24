"use client";

import { useState, useEffect } from "react";
import type { InitProgress, ModelId } from "@/lib/webllm";
import { initEngine, MODELS, DEFAULT_MODEL } from "@/lib/webllm";
import { setModelReady } from "@/lib/storage";

interface ModelLoaderProps {
  onReady: () => void;
}

export function ModelLoader({ onReady }: ModelLoaderProps) {
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<InitProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setDownloading(true);
    setError(null);
    try {
      await initEngine(selectedModel, (p) => setProgress(p));
      setModelReady();
      onReady();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setError(msg);
      setDownloading(false);
    }
  };

  const progressPercent = progress ? Math.round(progress.progress * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-600 to-sky-800 flex flex-col items-center justify-center px-6 text-white">
      <div className="max-w-sm w-full text-center">
        <div className="text-6xl mb-6">🤖</div>
        <h1 className="text-2xl font-bold mb-3">Configuração inicial</h1>
        <p className="text-sky-200 text-sm leading-relaxed mb-6">
          O app usa uma IA que roda <strong className="text-white">diretamente no seu celular</strong>,
          sem internet e sem custo. É necessário baixar o modelo uma única vez.
        </p>

        {/* Model selector */}
        {!downloading && (
          <div className="mb-6 space-y-3">
            {MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                  selectedModel === model.id
                    ? "border-white bg-white/20"
                    : "border-sky-400 bg-white/10 hover:bg-white/15"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{model.name}</span>
                  {model.recommended && (
                    <span className="text-xs bg-amber-400 text-amber-900 px-2 py-0.5 rounded-full font-medium">
                      Recomendado
                    </span>
                  )}
                </div>
                <p className="text-xs text-sky-200">{model.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Progress bar */}
        {downloading && (
          <div className="mb-6">
            <div className="flex justify-between text-xs text-sky-200 mb-1.5">
              <span>{progress?.text ?? "Preparando..."}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-sky-900 rounded-full h-2.5">
              <div
                className="bg-white rounded-full h-2.5 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-sky-300 mt-3">
              Isso pode demorar alguns minutos dependendo da sua conexão.
              Não feche a tela.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-500/30 border border-red-400 rounded-xl p-3 text-sm">
            <p className="font-medium mb-1">Erro ao carregar o modelo</p>
            <p className="text-red-200 text-xs">{error}</p>
            <p className="text-red-200 text-xs mt-2">
              Este app precisa de um navegador com suporte a WebGPU (Chrome ou Edge).
            </p>
          </div>
        )}

        {/* Action button */}
        {!downloading && (
          <button
            onClick={handleStart}
            className="w-full py-4 bg-white text-sky-700 font-bold rounded-2xl hover:bg-sky-50 transition-colors text-base"
          >
            Baixar e começar
          </button>
        )}

        {downloading && progressPercent < 100 && (
          <div className="flex items-center justify-center gap-2 text-sky-300 text-sm">
            <div className="w-4 h-4 border-2 border-sky-300 border-t-transparent rounded-full animate-spin" />
            Baixando...
          </div>
        )}
      </div>
    </div>
  );
}
