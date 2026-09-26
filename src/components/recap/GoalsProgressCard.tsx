'use client';

import { Target } from 'lucide-react';
import ProgressRing from '@/components/charts/ProgressRing';
import type { RecapExtras } from '@/types/recap';

interface GoalsProgressCardProps {
  goalsDelta: RecapExtras['goalsDelta'];
}

/**
 * Goal movement for the period: goals completed within it, how many are still
 * active, and the average completion progress across active goals.
 * Source: Goal rows.
 */
export default function GoalsProgressCard({ goalsDelta }: GoalsProgressCardProps) {
  const { completedInPeriod, activeCount, averageProgress } = goalsDelta;
  const hasGoals = completedInPeriod > 0 || activeCount > 0;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-sky-500/10 p-2 text-sky-500">
          <Target className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Goals</h2>
      </header>

      {hasGoals ? (
        <div className="flex items-center gap-6">
          <ProgressRing
            value={averageProgress}
            size={104}
            strokeWidth={10}
            color="var(--sky, #0ea5e9)"
            label="avg progress"
            ariaLabel={`Average goal progress ${averageProgress} percent`}
          />
          <dl className="space-y-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Completed this period
              </dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                {completedInPeriod}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Still active
              </dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">
                {activeCount}
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Create goals to track progress here.
        </p>
      )}
    </section>
  );
}