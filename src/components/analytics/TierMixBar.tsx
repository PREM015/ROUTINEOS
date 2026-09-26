'use client';

import { cn } from '@/lib/utils';
import type { AnalyticsTierMix } from '@/types/analytics';
import type { HabitTier } from '@prisma/client';

interface TierMixBarProps {
  tierMix: AnalyticsTierMix[];
}

const TIER_META: Record<HabitTier, { label: string; bar: string; dot: string }> = {
  NON_NEGOTIABLE: { label: 'Non-Negotiable', bar: 'bg-red-500', dot: 'bg-red-500' },
  GROWTH: { label: 'Growth', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  BONUS: { label: 'Bonus', bar: 'bg-sky-500', dot: 'bg-sky-500' },
  LIFESTYLE: { label: 'Lifestyle', bar: 'bg-amber-500', dot: 'bg-amber-500' },
  FLEXIBLE: { label: 'Flexible', bar: 'bg-violet-500', dot: 'bg-violet-500' },
  ALTERNATIVE: { label: 'Alternative', bar: 'bg-teal-500', dot: 'bg-teal-500' },
  OPTIONAL: { label: 'Optional', bar: 'bg-zinc-400', dot: 'bg-zinc-400' },
  EXPERIMENTAL: { label: 'Experimental', bar: 'bg-pink-500', dot: 'bg-pink-500' },
  SPECIAL: { label: 'Special', bar: 'bg-fuchsia-500', dot: 'bg-fuchsia-500' },
  JUST_FOR_FUN: { label: 'Just for Fun', bar: 'bg-orange-500', dot: 'bg-orange-500' },
  UNDEFINED: { label: 'Undefined', bar: 'bg-zinc-400', dot: 'bg-zinc-400' },
} as const;

/**
 * Habit mix by tier as a stacked horizontal bar. Source: Habit rows grouped by
 * tier (counts from the real habit set — an empty list renders a placeholder).
 */
export default function TierMixBar({ tierMix }: TierMixBarProps) {
  const total = tierMix.reduce((sum, row) => sum + row.count, 0);

  if (total === 0) {
    return (
      <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Habit mix</h2>
        <p className="py-6 text-center text-sm text-muted-foreground">
          No habits yet — the tier mix will appear once you add some.
        </p>
      </section>
    );
  }

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Habit mix</h2>
      <div aria-hidden="true" className="flex h-5 w-full gap-0.5 overflow-hidden rounded-full">
        {tierMix.map((row) => (
          <div
            key={row.tier}
            title={`${TIER_META[row.tier].label}: ${row.count}`}
            className={cn('h-full', TIER_META[row.tier].bar)}
            style={{ width: `${(row.count / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {tierMix.map((row) => (
          <li key={row.tier} className="flex items-center gap-2 text-sm">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TIER_META[row.tier].dot)} aria-hidden="true" />
            <span className="flex-1 text-muted-foreground">{TIER_META[row.tier].label}</span>
            <span className="font-semibold tabular-nums text-foreground">{row.count}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}