"use client";

import type { EngineStatus } from "@/types";

export const MODELS = [
  {
    id: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
    name: "Llama 3.2 · 1B",
    sizeMB: 900,
    description: "Rápido, leve (~900MB) — recomendado para celular",
    recommended: true,
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    name: "Llama 3.2 · 3B",
    sizeMB: 2000,
    description: "Mais inteligente (~2GB) — melhor para computador",
    recommended: false,
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export const DEFAULT_MODEL: ModelId = MODELS[0].id;

export interface InitProgress {
  progress: number;
  text: string;
}

type MLCEngineType = {
  chat: {
    completions: {
      create: (options: {
        messages: Array<{ role: string; content: string }>;
        stream: true;
        temperature?: number;
        max_tokens?: number;
      }) => Promise<AsyncIterable<{
        choices: Array<{ delta: { content?: string }; finish_reason: string | null }>;
      }>>;
    };
  };
};

let engine: MLCEngineType | null = null;
let engineStatus: EngineStatus = "idle";
let engineModel: string | null = null;

export function getEngineStatus(): EngineStatus {
  return engineStatus;
}

export async function initEngine(
  modelId: ModelId = DEFAULT_MODEL,
  onProgress?: (p: InitProgress) => void
): Promise<void> {
  if (engine && engineModel === modelId) return;

  engineStatus = "loading";

  try {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    engine = (await CreateMLCEngine(modelId, {
      initProgressCallback: (report: { progress: number; text: string }) => {
        onProgress?.({ progress: report.progress, text: report.text });
      },
    })) as MLCEngineType;
    engineModel = modelId;
    engineStatus = "ready";
  } catch (err) {
    engineStatus = "error";
    engine = null;
    throw err;
  }
}

export async function streamChat(
  messages: Array<{ role: string; content: string }>,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!engine) {
    throw new Error("Engine not initialized. Call initEngine() first.");
  }

  const stream = await engine.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.8,
    max_tokens: 300,
  });

  let fullText = "";

  for await (const chunk of stream) {
    if (signal?.aborted) break;
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      fullText += delta;
      onChunk(delta);
    }
  }

  return fullText;
}
