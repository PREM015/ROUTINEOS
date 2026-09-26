'use client';

import { CheckCircle2, CircleDashed, Clock4 } from 'lucide-react';
import type { AnalyticsTaskQuadrant } from '@/types/analytics';

interface TaskQuadrantCardProps {
  tasks: AnalyticsTaskQuadrant;
}

const QUADRANTS: Array<{
  key: 'urgentImportant' | 'urgentNotImportant' | 'importantNotUrgent' | 'neither';
  label: string;
  className: string;
}> = [
  { key: 'urgentImportant', label: 'Do first', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  { key: 'urgentNotImportant', label: 'Delegate', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { key: 'importantNotUrgent', label: 'Schedule', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  { key: 'neither', label: 'Eliminate', className: 'bg-muted text-muted-foreground' },
];

/**
 * Eisenhower task quadrant plus open/overdue counts. Source: Task rows with
 * projected priority vs due dates — every value comes from real tasks.
 */
export default function TaskQuadrantCard({ tasks }: TaskQuadrantCardProps) {
  const hasTasks = tasks.open > 0 || tasks.overdue > 0;

  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-sky-500/10 p-2 text-sky-500">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Task matrix</h2>
      </header>

      {hasTasks || QUADRANTS.some((q) => tasks[q.key] > 0) ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {QUADRANTS.map((q) => (
              <div key={q.key} className="rounded-xl border border-border/60 bg-card/60 p-3">
                <p className={`text-xs font-semibold ${q.className}`}>{q.label}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-foreground">{tasks[q.key]}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <CircleDashed className="h-4 w-4 text-sky-500" aria-hidden="true" />
              {tasks.open} open
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Clock4 className="h-4 w-4 text-rose-500" aria-hidden="true" />
              {tasks.overdue} overdue
            </span>
          </div>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Open tasks will be plotted into the Eisenhower matrix here.
        </p>
      )}
    </section>
  );
}