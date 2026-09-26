'use client';

import { Timer } from 'lucide-react';
import type { RecapExtras } from '@/types/recap';
import BarChart from '@/components/charts/BarChart';

interface FocusBreakdownCardProps {
  focusByCategory: RecapExtras['focusByCategory'];
}

/**
 * Focus minutes grouped by category for the period. Source: FocusSession rows
 * (completed sessions with a duration, bucketed by their linked category).
 */
export default function FocusBreakdownCard({ focusByCategory }: FocusBreakdownCardProps) {
  const rows = [...focusByCategory]
    .sort((a, b) => b.minutes - a.minutes)
    .map((row) => ({ name: row.name, minutes: row.minutes }));

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-amber-500/10 p-2 text-amber-500">
          <Timer className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Focus by category</h2>
      </header>

      {rows.length > 0 ? (
        <div className="h-48">
          <BarChart
            data={rows}
            xKey="name"
            dataKey="minutes"
            height={192}
            colors={['#f59e0b']}
            barSize={28}
            ariaLabel="Focus minutes by category"
          />
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No focus sessions completed in this period yet.
        </p>
      )}
    </section>
  );
}