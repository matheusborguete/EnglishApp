"use client";

import { useEffect, useState } from "react";
import type { UserProgress } from "@/types";
import { loadProgress } from "@/lib/storage";

export function ProgressDashboard() {
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    const p = loadProgress();
    if (p.totalSessions > 0) setProgress(p);
  }, []);

  if (!progress) return null;

  const today = new Date().toISOString().split("T")[0];
  const sessionsToday = progress.weeklySessionDates.filter((d) => d === today).length;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    return d.toISOString().split("T")[0];
  });

  return (
    <div className="max-w-2xl mx-auto px-4 mt-8 mb-4">
      <h2 className="text-base font-semibold text-gray-700 mb-3">Seu progresso</h2>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard emoji="🔥" value={`${progress.streak}`} label="dias seguidos" />
        <StatCard emoji="💬" value={`${progress.totalSessions}`} label="conversas" />
        <StatCard emoji="⏱️" value={`${progress.totalMinutes}`} label="minutos" />
      </div>

      {/* 7-day activity strip */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs text-gray-400 mb-2 font-medium">Últimos 7 dias</p>
        <div className="flex gap-1.5">
          {days.map((day) => {
            const count = progress.weeklySessionDates.filter((d) => d === day).length;
            const isToday = day === today;
            return (
              <div key={day} className="flex flex-col items-center gap-1 flex-1">
                <div
                  className={`w-full rounded-md h-7 transition-colors ${
                    count > 0 ? "bg-sky-400" : "bg-gray-100"
                  } ${isToday && count === 0 ? "border-2 border-sky-200" : ""}`}
                />
                <span className="text-[10px] text-gray-300">
                  {new Date(day + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "narrow" })}
                </span>
              </div>
            );
          })}
        </div>
        {sessionsToday > 0 && (
          <p className="text-xs text-sky-500 text-center mt-2 font-medium">
            {sessionsToday} conversa{sessionsToday > 1 ? "s" : ""} hoje! 🌟
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
      <div className="text-xl mb-0.5">{emoji}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
