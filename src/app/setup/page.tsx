"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveApiKey } from "@/lib/apikey";

export default function SetupPage() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith("gsk_")) {
      setError("A chave deve começar com gsk_");
      return;
    }

    setLoading(true);
    setError("");

    // Quick test call to validate the key
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (!res.ok) throw new Error("Chave inválida");
      saveApiKey(trimmed);
      router.replace("/");
    } catch {
      setError("Chave inválida ou sem conexão. Verifique e tente de novo.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-600 to-sky-800 flex flex-col items-center justify-center px-6 text-white">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🔑</div>
          <h1 className="text-2xl font-bold mb-2">Configuração inicial</h1>
          <p className="text-sky-200 text-sm leading-relaxed">
            O app usa o Groq para processar as conversas com IA.
            É <strong className="text-white">gratuito</strong> — você só precisa criar uma chave.
          </p>
        </div>

        {/* Steps */}
        <div className="bg-white/10 rounded-2xl p-4 mb-6 space-y-3">
          {[
            { n: "1", text: "Abra numa nova aba:", link: "console.groq.com" },
            { n: "2", text: "Crie uma conta gratuita (pode usar o Google)" },
            { n: "3", text: "No menu lateral toque em API Keys → Create API Key" },
            { n: "4", text: "Copie a chave e cole abaixo" },
          ].map((step) => (
            <div key={step.n} className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-white/20 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {step.n}
              </span>
              <span className="text-sm text-sky-100">
                {step.text}
                {step.link && (
                  <a
                    href={`https://${step.link}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 underline text-white font-medium"
                  >
                    {step.link}
                  </a>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Input */}
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="gsk_..."
          className="w-full bg-white/15 border border-white/30 rounded-2xl px-4 py-3 text-white placeholder:text-sky-300 text-sm focus:outline-none focus:ring-2 focus:ring-white/50 mb-3"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        {error && (
          <p className="text-red-300 text-xs mb-3 text-center">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={!key.trim() || loading}
          className="w-full py-4 bg-white text-sky-700 font-bold rounded-2xl disabled:opacity-50 transition-opacity text-base"
        >
          {loading ? "Verificando..." : "Salvar e começar"}
        </button>

        <p className="text-xs text-sky-300 text-center mt-4">
          A chave fica salva só no seu celular. Não enviamos para nenhum servidor nosso.
        </p>
      </div>
    </div>
  );
}
