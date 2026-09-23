'use client';
import React from 'react';
import { useCountUp } from '@/components/motion/useCountUp';

interface MonthlySummaryWidgetProps {
  averageScore: number;
  bestDay: { date: string; score: number } | null;
  currentStreak: number;
  habitsCompleted: number;
}

export const MonthlySummaryWidget: React.FC<MonthlySummaryWidgetProps> = ({
  averageScore,
  bestDay,
  currentStreak,
  habitsCompleted,
}) => {
  const avg = useCountUp(averageScore, 1);
  const streak = useCountUp(currentStreak, 0.8);

  const statCards = [
    {
      label: 'Avg Score',
      value: Math.round(avg),
      accent: 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400',
      body: 'text-foreground',
    },
    {
      label: 'Streak',
      value: `${Math.round(streak)}`,
      hint: 'days',
      accent: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
      body: 'text-foreground',
    },
    {
      label: 'Habits',
      value: habitsCompleted,
      accent: 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400',
      body: 'text-foreground',
    },
  ];

  return (
    <div className="h-full rounded-xl border border-border bg-card p-4 shadow-sm transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-md fade-rise-in">
      <h3 className="text-lg font-semibold text-foreground mb-4">Monthly Summary</h3>

      <div className="grid grid-cols-2 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className={`p-3 rounded-lg border ${card.accent}`}>
            <p className="text-xs uppercase tracking-wide font-semibold mb-1">{card.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${card.body}`}>
              {card.value}
              {card.hint && <span className="text-sm font-normal">{card.hint}</span>}
            </p>
          </div>
        ))}

        <div className="p-3 rounded-lg border bg-amber-500/10 border-amber-500/20">
          <p className="text-xs uppercase tracking-wide font-semibold mb-1 text-amber-600 dark:text-amber-400">
            Best Day
          </p>
          {bestDay ? (
            <div>
              <p className="text-xl font-bold text-foreground tabular-nums">{bestDay.score}</p>
              <p className="text-xs text-muted-foreground">{bestDay.date}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">N/A</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MonthlySummaryWidget;