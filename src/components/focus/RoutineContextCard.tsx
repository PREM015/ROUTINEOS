'use client';

/**
 * RoutineContextCard — surfaces what the routine says should happen now.
 *
 * ## Why this belongs on /focus
 *
 * `/focus` is where the user actually does the work. The routine says *what*
 * and *when*; Focus says *how long* and records *that it happened*. Showing
 * the current scheduled block on the focus page closes the loop: the user does
 * not have to hold the schedule in their head to know what they should be doing,
 * and one click pre-populates the intent and duration so starting is fast.
 *
 * ## What it does NOT do
 *
 * - It does not duplicate the routine page.
 * - It does not tick the routine block as completed (that is /today's job).
 * - It does not create a new session automatically.
 * - It does not show the full day's schedule.
 * - It does not render while a session is live.
 *
 * The card surfaces at most two blocks: the current one and the next one.
 * If neither exists (no routine today, or the day is done), it renders nothing.
 *
 * ## Routine data
 *
 * Fetches `GET /api/routine/today` independently rather than through
 * `useRoutineDay`, because the focus page has different update semantics
 * (snapshot on mount, not live-refetch) and does not expose the hook's
 * `setLog` surface at all.
 *
 * ## Minute resolution
 *
 * Block times are `HH:mm` strings. The comparison is in minutes-since-midnight,
 * using `useNowMinutes` so it honours the user's timezone rather than the
 * browser's local zone.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Calendar, Clock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api-client';
import { useFocusStore } from '@/store/focus.store';
import { useNowMinutes } from '@/hooks/useNowMinutes';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Skeleton } from '@/components/ui/Skeleton';
import type { ResolvedDailyRoutine, ResolvedRoutineBlock } from '@/types/routine';

// ---------------------------------------------------------------------------
// Time helpers (minutes-since-midnight)
// ---------------------------------------------------------------------------

/** Parse "HH:mm" to minutes since midnight. Returns null on malformed input. */
function parseHHmm(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match || !match[1] || !match[2]) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** "HH:mm" → "H:mm am/pm" for display. */
function formatBlockTime(time: string): string {
  const minutes = parseHHmm(time);
  if (minutes === null) return time;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  const display12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "25 min left", "1h 10m left". */
function formatRemaining(minutes: number): string {
  if (minutes <= 0) return 'ending';
  if (minutes < 60) return `${minutes}m left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

/** "in 15 min", "in 1h 05m". */
function formatStartsIn(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h}h` : `in ${h}h ${String(m).padStart(2, '0')}m`;
}

// ---------------------------------------------------------------------------
// Block classification
// ---------------------------------------------------------------------------

interface BlockWithTiming extends ResolvedRoutineBlock {
  startMinutes: number;
  endMinutes: number;
}

function withTiming(block: ResolvedRoutineBlock): BlockWithTiming | null {
  const startMinutes = parseHHmm(block.startTime);
  const endMinutes = parseHHmm(block.endTime);
  if (startMinutes === null || endMinutes === null) return null;
  return { ...block, startMinutes, endMinutes };
}

function findCurrentBlock(
  blocks: ResolvedRoutineBlock[],
  nowMinutes: number
): BlockWithTiming | null {
  const timed = blocks.flatMap((b) => {
    const t = withTiming(b);
    return t ? [t] : [];
  });
  return (
    timed.find((b) => nowMinutes >= b.startMinutes && nowMinutes < b.endMinutes) ?? null
  );
}

function findNextBlock(
  blocks: ResolvedRoutineBlock[],
  nowMinutes: number
): BlockWithTiming | null {
  const timed = blocks.flatMap((b) => {
    const t = withTiming(b);
    return t ? [t] : [];
  });
  // First block that has not yet started
  return timed.find((b) => b.startMinutes > nowMinutes) ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface RoutineContextCardProps {
  className?: string;
}

export function RoutineContextCard({ className }: RoutineContextCardProps) {
  const status = useFocusStore((s) => s.status);
  const adopt = useFocusStore((s) => s.adopt);

  // Never show while a session is live — it would distract from the active timer.
  const live = status === 'running' || status === 'paused';

  const { timezone, today } = useUserTimezone();
  const { minutes: nowMinutes } = useNowMinutes(timezone);

  const [routine, setRoutine] = useState<ResolvedDailyRoutine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchedFor = useRef<string | null>(null);

  // Fetch today's routine — once per calendar day.
  useEffect(() => {
    if (!today) return;
    if (fetchedFor.current === today) return;
    fetchedFor.current = today;
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
  }, [today]);

  const { current, next } = useMemo(() => {
    if (!routine || nowMinutes === null) return { current: null, next: null };
    return {
      current: findCurrentBlock(routine.blocks, nowMinutes),
      next: findNextBlock(routine.blocks, nowMinutes),
    };
  }, [routine, nowMinutes]);

  /**
   * Pre-populate the store from a routine block so Start is fast.
   *
   * Sets:
   * - `intent`        — block title (what the user is doing)
   * - `routineBlockId`— links the session row to the block
   * - `plannedMs`     — remaining block time (if current) or full duration
   *
   * Nothing starts automatically. The user presses Start themselves.
   */
  const loadBlock = (block: BlockWithTiming, isCurrent: boolean) => {
    const fullDurationMs = (block.endMinutes - block.startMinutes) * 60_000;
    const plannedMs =
      isCurrent && nowMinutes !== null
        ? Math.max(60_000, (block.endMinutes - nowMinutes) * 60_000)
        : fullDurationMs;

    adopt({
      intent: block.title,
      routineBlockId: block.id,
      plannedMs: plannedMs > 0 ? plannedMs : fullDurationMs,
    });
  };

  if (live) return null;

  if (loading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !routine || (current === null && next === null)) return null;

  return (
    <section
      aria-labelledby="routine-context-heading"
      className={cn('w-full', className)}
    >
      <h2
        id="routine-context-heading"
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        Today&apos;s schedule
      </h2>

      <div className="space-y-2">
        {current && (
          <RoutineBlockRow
            block={current}
            label="Now"
            sublabel={`${formatBlockTime(current.startTime)} – ${formatBlockTime(current.endTime)}${
              nowMinutes !== null
                ? ` · ${formatRemaining(current.endMinutes - nowMinutes)}`
                : ''
            }`}
            accent="current"
            onFocus={() => loadBlock(current, true)}
          />
        )}

        {next && (
          <RoutineBlockRow
            block={next}
            label="Up next"
            sublabel={`${formatBlockTime(next.startTime)} – ${formatBlockTime(next.endTime)}${
              nowMinutes !== null ? ` · ${formatStartsIn(next.startMinutes - nowMinutes)}` : ''
            }`}
            accent="next"
            onFocus={() => loadBlock(next, false)}
          />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: one block row
// ---------------------------------------------------------------------------

function RoutineBlockRow({
  block,
  label,
  sublabel,
  accent,
  onFocus,
}: {
  block: BlockWithTiming;
  label: string;
  sublabel: string;
  accent: 'current' | 'next';
  onFocus: () => void;
}) {
  const blockColor = block.color ?? block.category?.color ?? null;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-border bg-card/40 px-3 py-2.5 shadow-sm transition-all duration-300 ease-out-expo hover:shadow-md hover:bg-card/80 hover:-translate-y-0.5',
        accent === 'current' && 'border-accent-focus/30 bg-accent-focus/5 shadow-[0_0_15px_rgba(var(--accent-focus),0.1)]'
      )}
    >
      {/* Colour pip — hidden when no colour assigned */}
      <span
        aria-hidden="true"
        className="h-8 w-1 shrink-0 rounded-full bg-border"
        style={blockColor ? { backgroundColor: blockColor } : undefined}
      />

      {/* Block info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[0.625rem] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
          {accent === 'current' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-focus/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent-focus">
              <Clock className="h-2.5 w-2.5" aria-hidden="true" />
              Active
            </span>
          )}
        </div>
        <p className="truncate text-sm font-medium text-foreground">{block.title}</p>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </div>

      {/* Action */}
      <button
        type="button"
        onClick={onFocus}
        className={cn(
          'tap-target inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-300 ease-out-expo hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          accent === 'current'
            ? 'bg-accent-focus/15 text-accent-focus hover:bg-accent-focus/25 shadow-sm hover:shadow-md'
            : 'border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
        )}
        aria-label={`Pre-fill focus session with ${block.title} (${label.toLowerCase()})`}
      >
        Focus
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

export default RoutineContextCard;
