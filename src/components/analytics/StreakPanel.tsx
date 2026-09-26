'use client';

import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalyticsStreakSnapshot } from '@/types/analytics';

interface StreakPanelProps {
  streaks: AnalyticsStreakSnapshot;
}

const RISK_META: Record<AnalyticsStreakSnapshot['riskLevel'], string> = {
  LOW: 'text-emerald-600 dark:text-emerald-400',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  HIGH: 'text-rose-600 dark:text-rose-400',
};

type StreakKind = 'total' | 'core' | 'growth' | 'minimum';

const KIND_LABEL: Record<StreakKind, string> = {
  total: 'Total',
  core: 'Core',
  growth: 'Growth',
  minimum: 'Minimum',
};

/**
 * Four-type streak panel (total / core / growth / minimum day) with the
 * longest streak, risk level, and the next milestone. Source: Streak record +
 * StreakAnalytics projections.
 */
export default function StreakPanel({ streaks }: StreakPanelProps) {
  const kinds: Array<{ kind: StreakKind; value: number }> = [
    { kind: 'total', value: streaks.current },
    { kind: 'core', value: streaks.core },
    { kind: 'growth', value: streaks.growth },
    { kind: 'minimum', value: streaks.minimum },
  ];

  return (
    <section className="glass-panel glow-primary relative overflow-hidden rounded-2xl p-6 shadow-soft lg:col-span-2">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />
      <header className="flex items-center justify-between gap-3">
        <span className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
          <Flame className="h-3.5 w-3.5" aria-hidden="true" />
          Streaks
        </span>
        <span className={cn('text-xs font-semibold uppercase tracking-wide', RISK_META[streaks.riskLevel])}>
          {streaks.riskLevel.toLowerCase()} risk
        </span>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kinds.map(({ kind, value }) => (
          <div key={kind} className="rounded-xl bg-card/70 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {KIND_LABEL[kind]}
            </p>
            <p className="mt-1 text-3xl font-black tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Longest</span>
          <span className="font-semibold tabular-nums text-foreground">{streaks.longest}d</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Next milestone</span>
          <span className="font-semibold tabular-nums text-foreground">
            {streaks.nextMilestone != null
              ? `${streaks.nextMilestone}d${
                  streaks.daysToNextMilestone != null
                    ? ` (in ${streaks.daysToNextMilestone}d)`
                    : ''
                }`
              : '—'}
          </span>
        </div>
      </dl>
    </section>
  );
}