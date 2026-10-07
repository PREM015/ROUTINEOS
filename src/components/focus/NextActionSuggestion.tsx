'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api-client';
import { useFocusStore } from '@/store/focus.store';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { useNowMinutes } from '@/hooks/useNowMinutes';
import { Button } from '@/components/ui/Button';
import type { ResolvedDailyRoutine, ResolvedRoutineBlock } from '@/types/routine';

function parseHHmm(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const h = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function formatBlockTime(time: string): string {
  const minutes = parseHHmm(time);
  if (minutes === null) return time;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const display12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatStartsIn(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${String(m).padStart(2, '0')}m`;
}

export function NextActionSuggestion({ className }: { className?: string }) {
  const status = useFocusStore((s) => s.status);
  const { timezone, today } = useUserTimezone();
  const { minutes: nowMinutes } = useNowMinutes(timezone);

  const [routine, setRoutine] = useState<ResolvedDailyRoutine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Only show when idle or just finished
  const show = status === 'idle' || status === 'finished';

  useEffect(() => {
    if (!show) return;
    if (!today) return;
    setLoading(true);
    setError(false);

    void apiRequest<ResolvedDailyRoutine>('/api/routine/today', { query: { date: today } })
      .then((data) => {
        setRoutine(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [show, today]);

  if (!show) return null;

  if (loading) {
    return (
      <div className={cn('w-full max-w-sm', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-12 w-full bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !routine) return null;

  const { next } = useMemo(() => {
    if (!routine || nowMinutes === null) return { next: null };
    const timed = routine.blocks
      .map((b) => {
        const start = parseHHmm(b.startTime);
        const end = parseHHmm(b.endTime);
        if (start === null || end === null) return null;
        return { ...b, startMinutes: start, endMinutes: end };
      })
      .filter((b): b is (ResolvedRoutineBlock & { startMinutes: number; endMinutes: number }) => b !== null);
    return {
      next: timed.find((b) => b.startMinutes > nowMinutes) ?? null,
    };
  }, [routine, nowMinutes]);

  if (!next) {
    return (
      <div className={cn('w-full max-w-sm text-center py-6', className)}>
        <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/50" aria-hidden="true" />
        <p className="mt-2 text-sm text-muted-foreground">No more blocks scheduled for today</p>
        <p className="mt-1 text-xs text-muted-foreground/70">Enjoy the rest of your day!</p>
      </div>
    );
  }

  const startsIn = next.startMinutes - (nowMinutes ?? 0);
  const fullDuration = (next.endMinutes - next.startMinutes);

  return (
    <section
      aria-labelledby="next-action-heading"
      className={cn('w-full max-w-sm', className)}
    >
      <h2 id="next-action-heading" className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-accent-focus" aria-hidden="true" />
        Up next
      </h2>

      <div className="group flex items-center gap-3 rounded-xl border border-border bg-card/40 px-3 py-3 shadow-sm transition-all duration-300 ease-out-expo hover:shadow-md hover:bg-card/80 hover:-translate-y-0.5">
        <span
          aria-hidden="true"
          className="h-10 w-1 shrink-0 rounded-full bg-border"
          style={{ backgroundColor: next.color ?? next.category?.color ?? 'currentColor' }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
              Up next
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-primary">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              {formatStartsIn(startsIn)}
            </span>
          </div>
          <p className="truncate text-sm font-medium text-foreground">{next.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatBlockTime(next.startTime!)} – {formatBlockTime(next.endTime!)} · {fullDuration}m
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full mt-2 tap-target"
          onClick={() => {
            // Pre-fill the intent and duration from the next block
            const store = useFocusStore.getState();
            store.adopt({
              intent: next.title,
              routineBlockId: next.id,
              plannedMs: fullDuration * 60_000,
            });
          }}
          disabled={status !== 'idle'}
        >
          <CheckCircle2 className="h-4 w-4 mr-2" aria-hidden="true" />
          Start when ready
          <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

export default NextActionSuggestion;