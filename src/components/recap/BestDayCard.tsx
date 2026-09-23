'use client';

import { Crown, Star } from 'lucide-react';

interface BestDayCardProps {
  date: string;
  score: number;
  subtitle?: string;
}

export default function BestDayCard({ date, score, subtitle }: BestDayCardProps) {
  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl glow-primary p-6 shadow-soft">
      <div
        className="pointer-events-none absolute -right-6 -top-6 text-[7rem] leading-none text-primary/10"
        aria-hidden="true"
      >
        ★
      </div>

      <p className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
        <Crown className="h-3.5 w-3.5" aria-hidden="true" />
        Best day
      </p>

      <p className="mt-5 text-lg font-semibold text-foreground">{date}</p>

      <div className="mt-1 flex items-center gap-2">
        <span className="text-5xl font-black tabular-nums text-primary">{score}</span>
        <span className="text-sm text-muted-foreground">points</span>
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
      </div>

      {subtitle && <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}