'use client';
import React from 'react';
import { CheckCircle2, Clock, Target, TrendingUp } from 'lucide-react';

interface PreviousMonthSummaryProps {
  month: string;
  year: number;
  averageScore: number;
  habitsCompleted: number;
  goalsMet: number;
  focusMinutes: number;
}

export const PreviousMonthSummary: React.FC<PreviousMonthSummaryProps> = ({
  month,
  year,
  averageScore,
  habitsCompleted,
  goalsMet,
  focusMinutes,
}) => {
  const focusHours = Math.round(focusMinutes / 60);

  return (
    <div className="glass-panel mx-auto w-full max-w-3xl rounded-2xl p-8 text-center shadow-soft">
      <h2 className="text-3xl font-bold text-foreground">
        {month} {year} Review
      </h2>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">
        Let&apos;s look back before planning ahead.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="glass-panel rounded-xl p-6">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            Avg Score
          </p>
          <p className="mt-2 text-4xl font-black tabular-nums text-foreground">{averageScore}</p>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-emerald-500">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Habits Done
          </p>
          <p className="mt-2 text-4xl font-black tabular-nums text-foreground">
            {habitsCompleted}
          </p>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-amber-500">
            <Target className="h-4 w-4" aria-hidden="true" />
            Goals Met
          </p>
          <p className="mt-2 text-4xl font-black tabular-nums text-foreground">{goalsMet}</p>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <p className="flex items-center justify-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-sky-500">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Deep Focus
          </p>
          <p className="mt-2 text-4xl font-black tabular-nums text-foreground">
            {focusMinutes > 0 ? `${focusHours}h` : '—'}
          </p>
        </div>
      </div>
    </div>
  );
};