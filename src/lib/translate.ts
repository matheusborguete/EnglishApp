"use client";

import Groq from "groq-sdk";
import { getApiKey } from "./apikey";

const cache = new Map<string, string>();

export async function translateToEnglish(ptText: string): Promise<string> {
  const key = ptText.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key not found");

  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `Translate this Portuguese phrase to natural spoken English for a conversation.
Give 2 short natural alternatives separated by " / ".
Reply with ONLY the English translations, nothing else.

Portuguese: "${ptText.trim()}"`,
      },
    ],
    temperature: 0.2,
    max_tokens: 80,
  });

  const result = response.choices[0]?.message?.content?.trim() ?? "";
  cache.set(key, result);
  return result;
}
