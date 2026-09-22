'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { getTodayString } from '@/lib/dates';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  PERIOD_LABEL,
  shiftAnchor,
  type Period,
} from '@/lib/period-range';
import { PeriodControl } from '@/components/shared/PeriodControl';

interface Block {
  blockId: string;
  title: string;
  startTime: string;
  endTime: string;
  status: 'COMPLETED' | 'MISSED' | 'PARTIAL' | 'IN_PROGRESS' | null;
}

interface Day {
  date: string;
  dayType: string;
  scheduled: boolean;
  total: number;
  completed: number;
  completionRate: number;
  blocks: Block[];
}

interface MonthData {
  month: string;
  scheduledDays: number;
  averageCompletionRate: number;
}

interface ProgressPayload {
  period: Period;
  anchorDate: string;
  startDate: string;
  endDate: string;
  label: string;
  days: Day[];
  months: MonthData[];
}

export function RoutineWidget() {
  const { selectedDate } = useApp();
  const today = selectedDate || getTodayString();

  const [period, setPeriod] = useState<Period>('day');
  const [anchorDate, setAnchorDate] = useState<string>(today);
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Record<string, Block['status']>>({});

  const load = useCallback(async (currentPeriod: Period, anchor: string) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/routine/progress?period=${currentPeriod}&date=${anchor}`);
      if (!res.ok) throw new Error('failed to load');
      const json = await res.json();
      setData(json?.data ?? null);
      setOverlay({});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period, anchorDate);
  }, [period, anchorDate, load]);

  const setAnchor = (next: Partial<{ period: Period; anchorDate: string }>) => {
    setPeriod(next.period ?? period);
    setAnchorDate(next.anchorDate ?? anchorDate);
  };

  const navigate = (delta: number) => setAnchorDate(shiftAnchor(anchorDate, period, delta));

  // Aggregate over the visible period.
  const totals = useMemo(() => {
    if (!data) return { scheduled: 0, done: 0, rate: 0 };
    if (period === 'year') {
      const withDays = data.months.filter((m) => m.scheduledDays > 0);
      const scheduled = data.months.reduce((sum, m) => sum + m.scheduledDays, 0);
      const rate = withDays.length > 0
        ? Math.round(
            withDays.reduce((sum, m) => sum + m.averageCompletionRate, 0) / withDays.length
          )
        : 0;
      return { scheduled, done: 0, rate };
    }
    const scheduled = data.days.reduce((sum, d) => sum + d.total, 0);
    const done = data.days.reduce((sum, d) => sum + d.completed, 0);
    return {
      scheduled,
      done,
      rate: scheduled > 0 ? Math.round((done / scheduled) * 100) : 0,
    };
  }, [data, period]);

  const isEmpty = useMemo(() => {
    if (!data) return true;
    if (period === 'year') {
      return data.months.every((m) => m.scheduledDays === 0);
    }
    return data.days.every((d) => !d.scheduled && d.total === 0);
  }, [data, period]);

  const statusOf = (blockId: string): Block['status'] =>
    overlay[blockId] ?? null;

  const toggleDone = async (blockId: string) => {
    if (togglingId) return;
    const current = statusOf(blockId);
    const next = current === 'COMPLETED' ? 'MISSED' : 'COMPLETED';
    setTogglingId(blockId);
    setOverlay((prev) => ({ ...prev, [blockId]: next }));
    try {
      const res = await fetch('/api/routine/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, date: anchorDate, status: next }),
      });
      if (!res.ok) throw new Error('log failed');
      void load('day', anchorDate);
    } catch {
      setOverlay((prev) => ({ ...prev, [blockId]: current }));
    } finally {
      setTogglingId(null);
    }
  };

  const activeDay = data?.days.find((d) => d.scheduled);
  const dayBlocks = activeDay?.blocks ?? [];

  return (
    <section
      aria-label="Routine Progress"
      className="bg-card border border-border rounded-xl p-4 flex flex-col min-w-0 min-h-0 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground truncate">Routine Progress</h3>
        <div className="flex items-center gap-2 shrink-0">
          <PeriodControl
            period={period}
            onPeriodChange={setPeriod}
            label={data?.label ?? '\u2014'}
            onPrev={() => navigate(-1)}
            onNext={() => navigate(1)}
            onToday={() => setAnchorDate(today)}
            todayLabel={PERIOD_LABEL[period]}
            size="sm"
          />
          <Link
            href="/routine"
            className="shrink-0 text-xs font-semibold text-primary hover:underline"
          >
            Manage
          </Link>
        </div>
      </div>

      <div className="mb-3 shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xl font-bold text-foreground tabular-nums">{totals.rate}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-indigo-600 to-indigo-400 h-2 rounded-full transition-all duration-500"
            style={{ width: `${totals.rate}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {period === 'year'
            ? `${totals.scheduled} scheduled routine days in ${data?.label ?? ''}`
            : `${totals.done} of ${totals.scheduled} blocks done`}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Couldn't load routine progress. Please try again.
        </p>
      ) : isEmpty ? (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-foreground">No activity recorded yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start completing your routine to see your progress here.
          </p>
        </div>
      ) : (
        <div className="min-h-0">
          {period === 'day' && (
            <div className="slim-scroll scroll-fade overflow-y-auto overscroll-contain max-h-[184px] pr-1 space-y-2">
              {dayBlocks.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm font-medium text-foreground">No activity recorded yet.</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Start completing your routine to see your progress here.
                  </p>
                </div>
              ) : (
                dayBlocks.map((block) => {
                  const done = statusOf(block.blockId) === 'COMPLETED';
                  return (
                    <div
                      key={`${activeDay?.date ?? ''}:${block.blockId}`}
                      className="flex items-center gap-2.5 h-14 min-h-[56px] rounded-lg border border-border bg-muted/30 px-2.5"
                    >
                      <button
                        onClick={() => toggleDone(block.blockId)}
                        disabled={togglingId === block.blockId}
                        aria-label={done ? `Mark ${block.title} not done` : `Mark ${block.title} done`}
                        className={cn(
                          'shrink-0 transition-colors disabled:opacity-50',
                          done ? 'text-emerald-500' : 'text-muted-foreground hover:text-emerald-500'
                        )}
                      >
                        {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            'truncate text-[13px] font-semibold',
                            done ? 'text-muted-foreground line-through' : 'text-foreground'
                          )}
                        >
                          {block.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {block.startTime} – {block.endTime}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {period === 'week' && <WeekView days={data!.days} onDayClick={(d) => setAnchor({ period: 'day', anchorDate: d })} />}

          {period === 'month' && <MonthView days={data!.days} onDayClick={(d) => setAnchor({ period: 'day', anchorDate: d })} />}

          {period === 'year' && (
            <YearView
              months={data!.months}
              onMonthClick={(month) => setAnchor({ period: 'month', anchorDate: `${month}-01` })}
            />
          )}
        </div>
      )}
    </section>
  );
}

function WeekView({ days, onDayClick }: { days: Day[]; onDayClick: (date: string) => void }) {
  const active = days.filter((d) => d.scheduled);
  return (
    <div className="slim-scroll scroll-fade overflow-y-auto overscroll-contain max-h-[184px] pr-1">
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-1.5 min-w-[420px]">
          {days.map((day) => (
            <button
              key={day.date}
              onClick={() => day.scheduled && onDayClick(day.date)}
              disabled={!day.scheduled}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 px-1 py-2 transition-colors',
                day.scheduled ? 'hover:border-primary/50 cursor-pointer' : 'opacity-40'
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {format(parseISO(day.date), 'EEE')}
              </span>
              <span className="text-xs text-foreground tabular-nums">{day.completed}/{day.total}</span>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${day.completionRate}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {active.length === 0
          ? 'Nothing scheduled this week.'
          : `${active.length} of 7 days have a scheduled routine.`}
      </p>
    </div>
  );
}

function MonthView({ days, onDayClick }: { days: Day[]; onDayClick: (date: string) => void }) {
  const active = days.filter((d) => d.scheduled);
  return (
    <div className="slim-scroll scroll-fade overflow-y-auto overscroll-contain max-h-[184px] pr-1">
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const filled = day.total > 0;
          return (
            <button
              key={day.date}
              onClick={() => filled && onDayClick(day.date)}
              disabled={!filled}
              title={filled ? `${format(parseISO(day.date), 'MMM d')}: ${day.completed}/${day.total} blocks (${day.completionRate}%)` : format(parseISO(day.date), 'MMM d')}
              className={cn(
                'flex items-center justify-center rounded-md border text-xs font-medium py-1.5 transition-colors h-9',
                !filled
                  ? 'border-border text-muted-foreground/50 bg-muted/20'
                  : day.completionRate >= 75
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500 cursor-pointer'
                    : day.completionRate >= 40
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:border-amber-500 cursor-pointer'
                      : 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:border-rose-500 cursor-pointer'
              )}
            >
              {format(parseISO(day.date), 'd')}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {active.length === 0
          ? 'Nothing scheduled this month.'
          : `${active.length} active days this month. Click a day for details.`}
      </p>
    </div>
  );
}

function YearView({ months, onMonthClick }: { months: MonthData[]; onMonthClick: (month: string) => void }) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const active = months.filter((m) => m.scheduledDays > 0);
  return (
    <div className="slim-scroll scroll-fade overflow-y-auto overscroll-contain max-h-[184px] pr-1">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
        {months.map((month) => {
          const index = Number(month.month.slice(5, 7)) - 1;
          const name = monthNames[index] ?? month.month;
          const filled = month.scheduledDays > 0;
          return (
            <button
              key={month.month}
              onClick={() => filled && onMonthClick(month.month)}
              disabled={!filled}
              title={filled ? `${name}: ${month.averageCompletionRate}% avg on ${month.scheduledDays} scheduled days` : `${name}: no routine`}
              className={cn(
                'flex flex-col items-center rounded-lg border border-border bg-muted/30 px-1 py-2 transition-colors',
                filled ? 'hover:border-primary/50 cursor-pointer' : 'opacity-40'
              )}
            >
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">{name}</span>
              <span className="text-sm font-bold text-foreground tabular-nums">
                {filled ? `${month.averageCompletionRate}%` : '\u2014'}
              </span>
              <div className="w-full bg-muted rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${month.averageCompletionRate}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {active.length === 0
          ? 'No routine scheduled this year.'
          : `${active.length} active months this year. Click a month for details.`}
      </p>
    </div>
  );
}

export default RoutineWidget;