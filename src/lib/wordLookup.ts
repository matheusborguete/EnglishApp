"use client";

import Groq from "groq-sdk";
import { getApiKey } from "./apikey";

export interface WordInfo {
  word: string;
  pt: string;
  type: string;
  example: string;
}

// In-memory cache — survives the session, cleared on reload
const cache = new Map<string, WordInfo>();

export async function lookupWord(rawWord: string): Promise<WordInfo> {
  const word = rawWord.toLowerCase().replace(/[^a-z']/g, "");
  if (!word) throw new Error("Empty word");

  if (cache.has(word)) return cache.get(word)!;

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key not found");

  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `Translate the English word "${word}" to Brazilian Portuguese.
Reply with ONLY valid JSON, no extra text:
{"pt":"tradução em português","type":"noun/verb/adjective/adverb/phrase","example":"One natural English sentence using this word."}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 120,
  });

  const text = response.choices[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("Could not parse response");

  const parsed = JSON.parse(match[0]) as { pt: string; type: string; example: string };
  const info: WordInfo = { word, ...parsed };
  cache.set(word, info);
  return info;
}
