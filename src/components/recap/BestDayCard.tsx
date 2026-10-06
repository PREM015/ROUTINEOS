'use client';

import { Crown, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Which unit the headline number is measured in.
 *
 * The year view used to pass a `YYYY-MM` month key and a month *average* into
 * this card, which rendered "2026-03" and "Best day" and "71 points" — a month
 * labelled as a day, with an average labelled as a score. The component had no
 * way to know, because nothing told it.
 */
export type BestPeriodKind = 'day' | 'month';

interface BestDayCardProps {
  /** A formatted label, e.g. "Tue, Mar 3" for a day or "Mar" for a month. */
  date: string;
  score: number;
  subtitle?: string;
  kind?: BestPeriodKind;
}

export default function BestDayCard({
  date,
  score,
  subtitle,
  kind = 'day',
}: BestDayCardProps) {
  const isMonth = kind === 'month';
  const heading = isMonth ? 'Best month' : 'Best day';
  const unit = isMonth ? 'avg score' : 'points';

  return (
    <div className="glass-panel relative overflow-hidden rounded-2xl glow-primary p-6 shadow-soft">
      <div
        className="pointer-events-none absolute -right-6 -top-6 text-[7rem] leading-none text-primary/10"
        aria-hidden="true"
      >
        ★
      </div>

      <p
        className={cn(
          'shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1',
          'text-[11px] font-bold uppercase tracking-widest text-primary'
        )}
      >
        <Crown className="h-3.5 w-3.5" aria-hidden="true" />
        {heading}
      </p>

      <p className="mt-5 text-lg font-semibold text-foreground">{date}</p>

      <div className="mt-1 flex items-center gap-2">
        <span className="text-5xl font-black tabular-nums text-primary">{score}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" aria-hidden="true" />
      </div>

      {subtitle && <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}