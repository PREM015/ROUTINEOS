'use client';
import React from 'react';
import { CalendarDays, CheckCircle2, Crown, Trophy } from 'lucide-react';

interface WeeklyReviewSummaryProps {
  review: {
    weekStart: string;
    weekEnd: string;
    averageScore: number;
    habitsCompleted: number;
    habitsScheduled?: number;
    goalsAchieved: number;
    biggestWin?: string;
  };
}

export const WeeklyReviewSummary: React.FC<WeeklyReviewSummaryProps> = ({ review }) => {
  const habitsDetail =
    review.habitsScheduled != null && review.habitsScheduled > 0
      ? `${review.habitsCompleted} of ${review.habitsScheduled} habit checks`
      : `${review.habitsCompleted} habit completions`;

  return (
    <div className="glass-panel glow-primary mx-auto max-w-2xl rounded-2xl p-6 shadow-soft">
      <div className="mb-6 border-b border-border/60 pb-4 text-center">
        <p className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Weekly Review
        </p>
        <h2 className="mt-3 text-2xl font-bold text-foreground">Your week in numbers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {review.weekStart} - {review.weekEnd}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass-panel rounded-xl p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Avg Score</p>
          <p className="mt-1 text-4xl font-black tabular-nums text-foreground">
            {Math.round(review.averageScore)}
          </p>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <p className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Habits Done
          </p>
          <p className="mt-1 text-4xl font-black tabular-nums text-foreground">
            {review.habitsCompleted}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{habitsDetail}</p>
        </div>
        <div className="glass-panel rounded-xl p-4 text-center">
          <p className="flex items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-amber-500">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            Goals Met
          </p>
          <p className="mt-1 text-4xl font-black tabular-nums text-foreground">
            {review.goalsAchieved}
          </p>
        </div>
      </div>

      {review.biggestWin && (
        <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-emerald-500">
            <Crown className="h-4 w-4" aria-hidden="true" />
            Biggest Win
          </h4>
          <p className="mt-2 text-sm text-foreground">{review.biggestWin}</p>
        </div>
      )}
    </div>
  );
};