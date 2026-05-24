"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Level } from "@/types";
import { TOPICS_LIST } from "@/lib/topics";

const LEVEL_LABELS: Record<Level, string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

const LEVEL_COLORS: Record<Level, string> = {
  beginner: "bg-emerald-100 text-emerald-700 border-emerald-200",
  intermediate: "bg-amber-100 text-amber-700 border-amber-200",
  advanced: "bg-purple-100 text-purple-700 border-purple-200",
};

const LEVEL_BUTTON_ACTIVE: Record<Level, string> = {
  beginner: "bg-emerald-500 text-white border-emerald-500",
  intermediate: "bg-amber-500 text-white border-amber-500",
  advanced: "bg-purple-500 text-white border-purple-500",
};

export function TopicGrid() {
  const router = useRouter();
  const [selectedLevel, setSelectedLevel] = useState<Level>("beginner");

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      {/* Level selector */}
      <div className="flex justify-center gap-2 mb-6">
        {(["beginner", "intermediate", "advanced"] as Level[]).map((level) => (
          <button
            key={level}
            onClick={() => setSelectedLevel(level)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-150 ${
              selectedLevel === level
                ? LEVEL_BUTTON_ACTIVE[level]
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            }`}
          >
            {LEVEL_LABELS[level]}
          </button>
        ))}
      </div>

      {/* Topic cards */}
      <div className="grid grid-cols-2 gap-3">
        {TOPICS_LIST.map((topic) => (
          <button
            key={topic.id}
            onClick={() => router.push(`/conversation/${topic.id}?level=${selectedLevel}`)}
            className="flex flex-col items-center p-4 rounded-2xl border-2 border-gray-100 bg-white hover:border-sky-200 hover:shadow-md transition-all duration-200 active:scale-95 group"
          >
            <span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-150">
              {topic.emoji}
            </span>
            <span className="font-semibold text-gray-800 text-sm text-center leading-tight mb-1.5">
              {topic.titlePT}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${LEVEL_COLORS[topic.difficulty]}`}
            >
              {LEVEL_LABELS[topic.difficulty]}
            </span>
            <p className="text-xs text-gray-400 text-center mt-1.5 leading-relaxed">
              {topic.descriptionPT}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
