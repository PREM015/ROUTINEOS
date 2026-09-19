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
import { MOOD_COLORS } from '../journal/JournalEntry';

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

function buildGrid(): DayCell[] {
  const end = new Date();
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
  const cells = React.useMemo(buildGrid, []);

  const weeks = React.useMemo(() => {
    const rows: DayCell[][] = [];
    const perWeek = 7;
    for (let i = 0; i < cells.length; i += perWeek) {
      rows.push(cells.slice(i, i + perWeek));
    }
    return rows;
  }, [cells]);

  const todayString = new Date().toISOString().slice(0, 10);

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