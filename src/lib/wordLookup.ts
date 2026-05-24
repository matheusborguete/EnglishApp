"use client";

import Groq from "groq-sdk";
import { getApiKey } from "./apikey";

export interface OtherMeaning {
  pt: string;
  type: string;
  example: string;
}

export interface WordInfo {
  word: string;
  contextPhrase: string;
  contextPt: string;
  type: string;
  otherMeanings: OtherMeaning[];
}

// Cache keyed by "word::context" so the same word in different sentences
// gets context-aware results.
const cache = new Map<string, WordInfo>();

export async function lookupWord(rawWord: string, context = ""): Promise<WordInfo> {
  const word = rawWord.toLowerCase().replace(/[^a-z']/g, "");
  if (!word) throw new Error("Empty word");

  const cacheKey = context ? `${word}::${context}` : word;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API key not found");

  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

  const contextLine = context
    ? `The word appears in this sentence: "${context}"\n`
    : "";

  const response = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [
      {
        role: "user",
        content: `${contextLine}Analyze the English word "${word}".

1. Identify its meaning IN THIS SPECIFIC CONTEXT (it may be part of a multi-word expression like "over and over again" or "make up").
2. List up to 2 other common meanings.

Reply with ONLY valid JSON, no extra text:
{
  "contextPhrase": "multi-word expression if applicable, otherwise just the word",
  "contextPt": "meaning in context in Brazilian Portuguese",
  "type": "grammatical role in context (noun/verb/adjective/adverb/preposition/expression)",
  "otherMeanings": [
    {"pt": "another common meaning in PT", "type": "grammatical type", "example": "Short natural English sentence."}
  ]
}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 250,
  });

  const text = response.choices[0]?.message?.content ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse response");

  const parsed = JSON.parse(match[0]) as Omit<WordInfo, "word">;
  const info: WordInfo = { word, ...parsed };
  cache.set(cacheKey, info);
  return info;
}
