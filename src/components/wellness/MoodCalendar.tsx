"use client";

/**
 * MoodCalendar — a GitHub-style weeks heatmap of mood logs. Each column is one
 * week ending today; each cell is one day, colored by the mood recorded that
 * day (from a `moodByDate` map, or by checking-in data via `onNeedMoodByDate`).
 *
 * Usage:
 *   <MoodCalendar moodByDate={{ '2026-09-17': 4 }} onSelectDate={openDay} />
 */
import * as React from 'react';
import Tooltip from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { MOOD_COLORS } from '@/constants/journal';

const WEEKS = 17;

export interface MoodCalendarProps {
  /** date (YYYY-MM-DD) → mood 1-5. Days without data are excluded. */
  moodByDate?: Record<string, number | null>;
  onSelectDate?: (date: string) => void;
  className?: string;
}

interface DayCell {
  date: string | null;
  day: number;
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  result.setDate(result.getDate() - day);
  return result;
}

function buildGrid(today: Date): DayCell[] {
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const start = startOfWeek(end);
  start.setDate(start.getDate() - (WEEKS - 1) * 7);

  const cells: DayCell[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    cells.push({
      date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate(),
      ).padStart(2, '0')}`,
      day: cursor.getDate(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

export default function MoodCalendar({ moodByDate, onSelectDate, className }: MoodCalendarProps) {
  /*
    `React.useMemo(buildGrid, [])` looked like a free memoisation and was not.

    The first argument has to be an inline function expression. Passing `buildGrid`
    directly also read `new Date()` — impure — so the value depended on WHEN it
    ran, not only on its (empty) dependencies. The grid could therefore be built
    during a render that was later thrown away, and it never rebuilt: a calendar
    left open across midnight kept showing yesterday's last week with no way to
    notice.

    Fixed by making the day an explicit input rather than something read from the
    clock inside the memo. `todayKey` is parsed back into a Date so the memo body
    is a pure function of it, and the dependency is therefore genuine rather than
    decorative — the grid rolls over when the day changes.
  */
  const todayKey = new Date().toDateString();
  const cells = React.useMemo(() => buildGrid(new Date(todayKey)), [todayKey]);

  const weeks = React.useMemo(() => {
    const rows: DayCell[][] = [];
    const perWeek = 7;
    for (let i = 0; i < cells.length; i += perWeek) {
      rows.push(cells.slice(i, i + perWeek));
    }
    return rows;
  }, [cells]);

  // The user's today. `new Date().toISOString().slice(0, 10)` is the **UTC**
  // date, so the "today" cell highlighted in the heatmap was a day out for
  // everyone not on UTC — most visibly in the evening, when a user in
  // `America/New_York` saw yesterday highlighted.
  const { today: todayString } = useUserTimezone();

  return (
    <div className={cn('w-full', className)}>
      <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label="Mood calendar heatmap">
        {weeks.map((week, weekIndex) =>
          week.map((cell, dayIndex) => {
            const key = `${weekIndex}-${dayIndex}`;
            if (!cell.date) {
              return <span key={key} aria-hidden="true" />;
            }
            const mood = moodByDate?.[cell.date];
            const color =
              mood !== null && mood !== undefined ? (MOOD_COLORS[mood] ?? '#6b7280') : null;
            const isToday = cell.date === todayString;
            const label =
              mood !== null && mood !== undefined
                ? `${cell.date} — mood ${mood}/5`
                : `${cell.date} — no check-in`;
            const button = (
              <button
                type="button"
                onClick={onSelectDate ? () => onSelectDate(cell.date ?? '') : undefined}
                disabled={!onSelectDate}
                aria-label={
                  mood !== null && mood !== undefined
                    ? `${cell.date}, mood ${mood} of 5`
                    : `${cell.date}, no check-in`
                }
                className={cn(
                  'aspect-square w-4 rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-default',
                  color ? 'transition-transform hover:scale-125' : 'bg-gray-200',
                  isToday && 'ring-2 ring-blue-600 ring-offset-1',
                )}
                style={color ? { backgroundColor: color } : undefined}
              />
            );
            return (
              <Tooltip key={key} content={label} side="top" delay={200}>
                {button}
              </Tooltip>
            );
          }),
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
        <span>Less</span>
        {[1, 2, 3, 4, 5].map((value) => (
          <span
            key={value}
            className="inline-block h-3 w-3 rounded-[3px]"
            style={{ backgroundColor: MOOD_COLORS[value] ?? '#6b7280' }}
            aria-hidden="true"
          />
        ))}
        <span>More</span>
        <span className="ml-auto rounded-md border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-600">
          Today
        </span>
      </div>
    </div>
  );
}