'use client';

import { AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { AnalyticsRoutineDetail } from '@/types/analytics';

interface RoutineDetailCardProps {
  routine: AnalyticsRoutineDetail;
}

/**
 * Routine detail for the selected period: per-block completion rates, days
 * tracked, and the most-missed block. Source: RoutineLog rows (one per block
 * per day, real statuses only — no fabricated numbers).
 */
export default function RoutineDetailCard({ routine }: RoutineDetailCardProps) {
  const trackedLogs = routine.blocks.reduce((sum, block) => sum + block.daysTracked, 0);
  const completedLogs = routine.blocks.reduce((sum, block) => sum + block.completed, 0);
  const overallRate = trackedLogs > 0 ? Math.round((completedLogs / trackedLogs) * 100) : 0;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-fuchsia-500/10 p-2 text-fuchsia-500">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Routine</h2>
      </header>

      {routine.blocks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No routine activity logged in this period.
        </p>
      ) : (
        <>
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Overall</span>
              <span className="font-semibold tabular-nums text-foreground">{overallRate}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Days tracked</span>
              <span className="font-semibold tabular-nums text-foreground">{routine.daysTracked}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Checks</span>
              <span className="font-semibold tabular-nums text-foreground">
                {completedLogs}/{trackedLogs}
              </span>
            </div>
          </dl>

          <ul className="mt-4 space-y-2.5">
            {routine.blocks.map((block) => (
              <li key={block.blockId} className="rounded-xl bg-card/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-medium text-foreground">
                    {block.title}
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                      {block.startTime}
                    </span>
                  </p>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {block.completed}/{block.daysTracked} · {block.completionRate}%
                  </p>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500"
                    style={{ width: `${Math.min(Math.max(block.completionRate, 0), 100)}%` }}
                    aria-hidden="true"
                  />
                </div>
                {block.missed > 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-500">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Missed {block.missed}×
                  </p>
                )}
              </li>
            ))}
          </ul>

          {routine.mostMissed && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
              Most missed:{' '}
              <span className="font-semibold text-foreground">{routine.mostMissed.title}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}