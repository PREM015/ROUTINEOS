'use client';

import { Clock3 } from 'lucide-react';
import type { AnalyticsTimeAllocation, AnalyticsTimeAllocationEntry } from '@/types/analytics';

interface TimeAllocationCardProps {
  allocation: AnalyticsTimeAllocation;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function AllocationList({
  rows,
  total,
  empty,
}: {
  rows: AnalyticsTimeAllocationEntry[];
  total: number;
  empty: string;
}) {
  const visible = rows.slice(0, 6);
  return (
    <>
      {visible.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const pct = total > 0 ? Math.round((row.minutes / total) * 100) : 0;
            return (
              <li key={row.label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="truncate text-foreground/90">{row.label}</p>
                  <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatMinutes(row.minutes)}
                    <span className="ml-1.5 font-semibold text-foreground">{pct}%</span>
                  </p>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > 6 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          +{rows.length - 6} more {rows.length - 6 === 1 ? 'entry' : 'entries'}
        </p>
      )}
    </>
  );
}

/**
 * Time allocation for the selected period: tracked minutes grouped by project,
 * habit, goal, or fallback bucket (TimeEntry rows), plus focused minutes
 * grouped by category (FocusSession rows). Real numbers only — no entries = an
 * explicit empty state.
 */
export default function TimeAllocationCard({ allocation }: TimeAllocationCardProps) {
  const hasTracked = allocation.entries.length > 0;
  const hasFocus = allocation.focusByCategory.length > 0;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Time</h2>
        {allocation.totalMinutes > 0 && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {formatMinutes(allocation.totalMinutes)} tracked
          </span>
        )}
      </header>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Tracked minutes
      </p>
      <AllocationList
        rows={allocation.entries}
        total={allocation.totalMinutes}
        empty="No time entries in this period."
      />

      {hasFocus && (
        <>
          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Focus by category
          </p>
          <AllocationList
            rows={allocation.focusByCategory}
            total={allocation.focusByCategory.reduce((sum, row) => sum + row.minutes, 0)}
            empty="No focus sessions in this period."
          />
        </>
      )}

      {!hasTracked && !hasFocus && (
        <p className="py-3 text-center text-sm text-muted-foreground">
          Track time or run focus sessions and they will be broken down here.
        </p>
      )}
    </section>
  );
}