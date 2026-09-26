'use client';

import { useEffect, useState } from 'react';
import { FlaskConical, CalendarDays } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { getTodayString } from '@/lib/dates';

interface DayDebugBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  trackCompletion: boolean;
  log?: { status: string } | null;
}

interface DayDebugResponse {
  date: string;
  dayType: string;
  template: { id: string; name: string; dayType: string; color?: string | null; blocks: DayDebugBlock[] } | null;
  exception: { id: string; dayType: string; reason?: string | null; note?: string | null; templateId?: string | null } | null;
  blocks: DayDebugBlock[];
}

const DAY_TYPE_LABELS: Record<string, string> = {
  WORKDAY: 'Weekday',
  WEEKEND: 'Weekend',
  HOLIDAY: 'Holiday',
  EXAM_DAY: 'Exam Day',
  LOW_ENERGY: 'Low Energy',
  CUSTOM: 'Custom',
};

/**
 * Day-plan resolver — a read-only, date-scoped debug view of which routine
 * template (and optional exception) actually drives a given day. Backed by
 * GET /api/routine/today, so it always mirrors the real resolution logic.
 */
export default function RoutineScheduleDebug() {
  const [date, setDate] = useState('');
  const [queryDate, setQueryDate] = useState('');
  const [data, setData] = useState<DayDebugResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = getTodayString();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only date sync to avoid SSR hydration mismatch
    setDate(today);
    setQueryDate(today);
  }, []);

  const run = async () => {
    if (!queryDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/routine/today?date=${queryDate}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to resolve day plan');
      }
      const json = await res.json();
      setData(json?.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve day plan');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryDate && date === queryDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDate]);

  return (
    <section className="glass-panel rounded-2xl p-5 shadow-soft">
      <header className="mb-4 flex items-center gap-2">
        <span className="inline-flex rounded-lg bg-muted p-2 text-muted-foreground">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Day plan resolver</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">debug</span>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input
            label="Date"
            type="date"
            value={queryDate}
            onChange={(e) => setQueryDate(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={loading || !queryDate}>
          {loading ? 'Resolving…' : 'Resolve'}
        </Button>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

      {data && (
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays size={14} className="text-muted-foreground" aria-hidden="true" />
            <span className="font-medium text-foreground">{data.date}</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {DAY_TYPE_LABELS[data.dayType] ?? data.dayType}
            </span>
            {data.exception && (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
                Override
              </span>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-3">
            {data.exception ? (
              <>
                <p className="text-muted-foreground">
                  Day is overridden to <span className="font-semibold text-foreground">{DAY_TYPE_LABELS[data.exception.dayType] ?? data.exception.dayType}</span>
                  {data.exception.reason ? <span className="text-muted-foreground"> — “{data.exception.reason}”</span> : null}.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                No override for this date — the natural schedule applies.
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data.template && (
                <>
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: data.template.color ?? undefined }}
                    aria-hidden="true"
                  />
                  <span className="font-medium text-foreground">{data.template.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {DAY_TYPE_LABELS[data.template.dayType] ?? data.template.dayType}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    template {data.template.id.slice(-4)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="text-muted-foreground">
            <span className="font-semibold text-foreground">{data.blocks.length}</span> block{data.blocks.length === 1 ? '' : 's'} scheduled
            {data.blocks.length > 0 && (
              <span className="ml-2 text-[11px]">({data.blocks.filter(b => b.trackCompletion).length} tracked)</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}