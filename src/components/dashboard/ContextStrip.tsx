'use client';

/**
 * Context Strip - two single lines, not cards.
 *
 * Left is the weekly verdict. Right is the "right now" status chip.
 *
 * ## Why the verdict is about the week, never about today
 *
 * `/today` owns a daily verdict ("Half the day left", "Every habit done"). If the
 * dashboard's strip were also about today, the same page would show two verdicts
 * about the same day, worded differently, and one of them would eventually be
 * wrong. So this is always computed over the trailing 7 days and phrased as a
 * summary of a *period*. The two cannot collide because they answer different
 * questions about different spans.
 *
 * ## Why "right now" survives at all
 *
 * The full `RightNow` card is gone: a countdown ring with Done/Missed buttons is
 * an interactive control, and an interactive control on a page whose whole
 * premise is "nothing here is a checkbox" is a category error. But people do
 * glance at the dashboard mid-day, and a one-second confirmation that they are
 * not missing something is genuinely useful. So it stays - as a single
 * read-only line that links to `/today`, which owns the real thing.
 *
 * The countdown is derived from the same `getCurrentBlock` helper `/today` uses,
 * rather than a second implementation. F7 was exactly this: two implementations
 * of "what's happening now" disagreeing, one of which showed a finished block as
 * "Next".
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useDashboardOverview } from '@/components/dashboard/useDashboardOverview';
import { getCurrentBlock, calculateBlockProgress } from '@/lib/routine/duration';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import type { DashboardDay } from '@/types/dashboard';
import { WEEKDAY_LABELS } from '@/constants/dashboard';

interface Block {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string | null;
}

/** Current wall-clock time as `HH:mm` in the USER's timezone. */
function wallClock(timezone: string): string {
  if (typeof window === 'undefined') return '00:00';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    // An invalid IANA zone in settings must not break the page.
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(
      new Date()
    );
  }
}

function formatRemaining(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m left`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

/**
 * The weekly verdict, in one clause.
 *
 * Only ever about the trailing 7 days. Ordinals are chosen from the actual
 * scored days, so "your best Tuesday in a month" is a claim the data supports or
 * it is not said at all.
 */
function weeklyVerdict(days: DashboardDay[]): string | null {
  const window = days.slice(-7);
  const scored = window.filter((d) => d.totalScore !== null);
  if (scored.length < 2) return null;

  const average = scored.reduce((sum, d) => sum + (d.totalScore ?? 0), 0) / scored.length;

  // Which weekday was best, and does it actually stand out?
  const byWeekday = new Map<number, { sum: number; count: number }>();
  for (const day of scored) {
    const dow = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
    const bucket = byWeekday.get(dow) ?? { sum: 0, count: 0 };
    bucket.sum += day.totalScore ?? 0;
    bucket.count += 1;
    byWeekday.set(dow, bucket);
  }
  const weekdayAverages = Array.from(byWeekday.entries()).map(([dow, b]) => ({
    dow,
    avg: b.sum / b.count,
  }));
  weekdayAverages.sort((a, b) => b.avg - a.avg);
  const bestWeekday = weekdayAverages[0];
  const runnerUp = weekdayAverages[1];
  // Only claim a "best weekday" when it actually beats the runner-up. A
  // one-point lead is noise, and announcing it as a pattern would be the
  // narrative equivalent of a misleading chart.
  const standout =
    bestWeekday && runnerUp && bestWeekday.avg - runnerUp.avg >= 8
      ? `your best ${WEEKDAY_LABELS[bestWeekday.dow]} this month`
      : null;

  const pct = Math.round(average);
  if (standout) return `This week: ${pct}% average — ${standout}.`;
  if (pct >= 80) return `This week: ${pct}% average. Holding steady.`;
  if (pct >= 55) return `This week: ${pct}% average. Mixed across the domains.`;
  return `This week: ${pct}% average. Light week — one strong day would move it.`;
}

export function ContextStrip({ dayTypeName }: { dayTypeName?: string | null }) {
  const { data, loading } = useDashboardOverview();
  const { timezone } = useUserTimezone();
  const [blocks, setBlocks] = useState<Block[]>([]);
  // Re-evaluated on an interval so the countdown rolls over at a block boundary
  // without a refetch. 30s because a boundary is the only thing that can change
  // which block is current.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/routine/today');
        if (!res.ok) throw new Error('unavailable');
        const json = await res.json();
        if (!cancelled && json.success) {
          setBlocks(Array.isArray(json.data?.blocks) ? (json.data.blocks as Block[]) : []);
        }
      } catch {
        // The strip degrades to just the weekly verdict. A failed routine fetch
        // must not take the context line down with it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayTypeName]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /*
    `now` is computed during render, deliberately, not memoised.

    It has to re-evaluate when `tick` advances so the countdown rolls over at a
    block boundary, and memoising it either drops that dependency (and the chip
    goes stale) or keeps it as a dependency ESLint correctly flags as
    unnecessary - because the value genuinely does not *read* `tick`.

    One `Intl.DateTimeFormat` call per render, against a 30s tick, is cheaper than
    the useMemo bookkeeping it replaces.
  */
  const now = wallClock(timezone);

  // `tick` is the re-evaluation trigger; referenced here so the intent is
  // explicit rather than implicit in a dependency array.
  void tick;

  const current = useMemo(() => getCurrentBlock(blocks, now) as Block | null, [blocks, now]);
  const remaining = useMemo(
    () =>
      current
        ? calculateBlockProgress(current.startTime, current.endTime, now)?.minutesRemaining ?? 0
        : 0,
    [current, now]
  );

  const verdict = useMemo(
    () => (data ? weeklyVerdict(data.days) : null),
    [data]
  );

  return (
    <div className="flex flex-col gap-2 border-y border-border/60 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      {/* LEFT: the weekly verdict. */}
      <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {loading ? (
          <span className="inline-block h-3.5 w-56 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        ) : (
          <span className="truncate">{verdict ?? 'Log a few days and this week gets a verdict.'}</span>
        )}
      </p>

      {/* RIGHT: the right-now chip. Read-only, links out. */}
      <div className="flex shrink-0 items-center gap-3">
        {current && (
          <span className="flex items-center gap-2 text-sm">
            {dayTypeName && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {dayTypeName}
              </span>
            )}
            <span className="font-medium text-foreground">{current.title}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatRemaining(remaining)}
            </span>
          </span>
        )}
        <Link
          href="/today"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Go to Today
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
