"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopicGrid } from "@/components/TopicGrid";
import { ProgressDashboard } from "@/components/ProgressDashboard";
import { hasApiKey, clearApiKey } from "@/lib/apikey";

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasApiKey()) {
      router.replace("/setup");
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Hero */}
      <div className="bg-gradient-to-br from-sky-600 to-sky-800 text-white pt-10 pb-14 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-5xl mb-3">💬</div>
          <h1 className="text-2xl font-bold mb-2 leading-tight">
            Pense em inglês.
            <br />
            Não em português.
          </h1>
          <p className="text-sky-200 text-sm leading-relaxed max-w-xs mx-auto">
            Pratique conversações reais com Emma, sua tutora de inglês por IA.
            Sem decorar gramática — só falar.
          </p>

          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {["🎙️ Voz", "💡 Correções suaves", "⚡ Respostas rápidas"].map((f) => (
              <span key={f} className="bg-white/15 text-white/90 text-xs px-3 py-1 rounded-full">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Topic selection */}
      <div className="py-6">
        <div className="text-center mb-5 px-4">
          <h2 className="text-lg font-bold text-gray-900">Escolha um tópico</h2>
          <p className="text-sm text-gray-500 mt-0.5">Selecione seu nível e comece a conversar</p>
        </div>
        <TopicGrid />
      </div>

      <ProgressDashboard />

      <footer className="text-center mt-6 text-xs text-gray-400 px-4 flex flex-col gap-2">
        <span>Powered by Llama 3.1 via Groq · Grátis para uso pessoal</span>
        <button
          onClick={() => { clearApiKey(); router.push("/setup"); }}
          className="text-gray-300 underline"
        >
          Trocar chave da API
        </button>
      </footer>
    </main>
  );
}
