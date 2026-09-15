'use client';

import { getScoreBandColor, getScoreBandEmoji, getScoreBandLabel } from '@/lib/scoring/bands';

interface TodayScoreProps {
  score: number;
  coreScore: number;
}

export function TodayScore({ score, coreScore }: TodayScoreProps) {
  const colorClass = getScoreBandColor(score);
  const emoji = getScoreBandEmoji(score);
  const label = getScoreBandLabel(score);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center">
      <div className="text-zinc-400 font-medium mb-4 uppercase tracking-wider text-sm">Today's Score</div>
      <div className="relative w-32 h-32 flex flex-col items-center justify-center rounded-full border-4 border-zinc-800">
        <div className={\`text-4xl font-bold \${colorClass}\`}>{score}</div>
        <div className="text-sm text-zinc-500">/ 100</div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        <span className={\`font-semibold \${colorClass}\`}>{label}</span>
      </div>
      <div className="mt-2 text-xs text-zinc-500">Core Score: {coreScore}</div>
    </div>
  );
}
