'use client';

import { CalendarX2 } from 'lucide-react';
import type { RecapExtras } from '@/types/recap';

interface RoutineExceptionsCardProps {
  exceptions: RecapExtras['routineExceptions'];
}

const DAY_TYPE_LABEL: Record<string, string> = {
  WORKDAY: 'Workday',
  WEEKEND: 'Weekend',
  HOLIDAY: 'Holiday',
  EXAM_DAY: 'Exam day',
  LOW_ENERGY: 'Low energy',
  CUSTOM: 'Custom',
};

function dayTypeLabel(dayType: string): string {
  return DAY_TYPE_LABEL[dayType] ?? dayType;
}

/**
 * Routine exceptions for the period — days where the routine was swapped,
 * scoped, or skipped (why a day might have looked off). Source:
 * RoutineException rows (real dates, notes, and reasons only).
 */
export default function RoutineExceptionsCard({ exceptions }: RoutineExceptionsCardProps) {
  return (
    <section className="glass-panel spotlight-hover rounded-2xl p-6 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-fuchsia-500/10 p-2 text-fuchsia-500">
          <CalendarX2 className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Routine changes</h2>
      </header>

      {exceptions.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No routine exceptions in this period.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {exceptions.map((exception) => (
            <li key={exception.date} className="rounded-xl bg-card/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold tabular-nums text-foreground">{exception.date}</p>
                <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-500">
                  {dayTypeLabel(exception.dayType)}
                </span>
              </div>
              {exception.templateName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Template: <span className="font-medium text-foreground">{exception.templateName}</span>
                </p>
              )}
              {(exception.reason || exception.note) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {exception.reason ?? exception.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}