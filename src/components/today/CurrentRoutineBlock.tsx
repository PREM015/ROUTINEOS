'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { GlassPanel, PanelEmpty, PanelHeader, PanelSkeleton, Tag } from '@/components/today/ui';
import { Button } from '@/components/ui/Button';
import { getCurrentBlock, getNextBlock, calculateBlockProgress } from '@/lib/routine/duration';

interface Block {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

const RING = 96;
const STROKE = 8;
const RADIUS = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * 2.7 — live "Right now" card.
 *
 * Adds a countdown **ring** (not just text), the **next** block, and uses the
 * block's own `color` as the card accent.
 *
 * ## Timezone
 *
 * The previous version compared `HH:mm` against the **browser's** local time, so
 * a user in `Asia/Kolkata` on a laptop set to UTC saw whichever block matched
 * UTC, not their own. `timezone` is now passed in from the page (which already
 * resolves it authoritatively) and every "now" is derived from the wall clock in
 * *that* zone, not from `new Date()`.
 *
 * The card previously also had no loading state and no empty state, so
 * "still fetching" and "nothing scheduled" looked identical and left an
 * unexplained hole in the bento grid.
 */
export function CurrentRoutineBlock({ timezone }: { timezone?: string }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * Bumped on a slow interval to re-evaluate "which block is current".
   *
   * The ring is driven by the block's own start/end times rather than a wall
   * clock, so a 1s tick would re-render without changing anything measurable.
   * 30s is fine because a block boundary is what matters, and the transition on
   * the ring is 1s.
   */
  const [tick, setTick] = useState(0);

  const fetchRoutine = useCallback(async () => {
    try {
      const res = await fetch('/api/routine/today');
      if (!res.ok) {
        throw new Error(`Could not load your routine (status ${res.status})`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Could not load your routine');
      setBlocks(Array.isArray(data.data?.blocks) ? (data.data.blocks as Block[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your routine');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRoutine();
    const poll = setInterval(() => void fetchRoutine(), 60_000);
    const onDayMode = () => void fetchRoutine();
    window.addEventListener('day-mode-changed', onDayMode);
    return () => {
      clearInterval(poll);
      window.removeEventListener('day-mode-changed', onDayMode);
    };
  }, [fetchRoutine]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /**
   * Current wall-clock time as `HH:mm` in the **user's** timezone.
   *
   * `Intl.DateTimeFormat` with an explicit `timeZone` is used rather than
   * `new Date().getHours()`, which reads the *device's* zone. That difference is
   * the whole bug: a user in Asia/Kolkata on a UTC laptop was being shown blocks
   * that were 5h30m out.
   *
   * `now` is passed in rather than read from the clock inside, so the caller's
   * memo can depend on the value that produced it.
   */
  const wallClock = useCallback(
    (now: number): string => {
      if (typeof window === 'undefined') return '00:00';
      try {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(now));
      } catch {
        // An invalid IANA zone in settings must not break the page.
        return new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date(now));
      }
    },
    [timezone]
  );

  const { current, next } = useMemo(() => {
    /*
      `tick` is what the clock depends on, and it has to be an ARGUMENT.

      It was listed as a dependency with a comment saying so, but `wallClock`
      takes no parameters and reads `new Date()` internally — so the linter was
      right that `tick` was unused. The consequence: the memo recomputed only when
      `blocks` or `timezone` changed, so the "Right now" card could sit on a block
      that had already ended until something else re-rendered the page. The
      countdown beside it kept moving while the block underneath it did not.

      Passing `tick` in makes the dependency real and the rollover work.
    */
    const now = wallClock(tick);
    const currentBlock = getCurrentBlock(blocks, now) as Block | null;
    if (!currentBlock) return { current: null, next: null };
    // `getNextBlock` already exists in lib/routine/duration and was unused —
    // this used to re-implement it inline against device-local time.
    const nextBlock = getNextBlock(blocks, now) as Block | null;

    return {
      current: currentBlock,
      next: nextBlock && nextBlock.id !== currentBlock.id ? nextBlock : null,
    };
    // `tick` is a deliberate dependency: it is what re-evaluates "now" so the
    // current block rolls over at a boundary without a refetch.
  }, [blocks, tick, wallClock]);

  if (loading) return <PanelSkeleton rows={3} className="min-h-[11rem]" />;

  if (error) {
    return (
      <GlassPanel accent="routine" className="min-h-[7rem]">
        <PanelHeader title="Right now" icon={<Clock3 className="h-4 w-4 text-accent-routine" />} />
        <div className="px-4 pb-4">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setLoading(true);
              void fetchRoutine();
            }}
          >
            Try again
          </Button>
        </div>
      </GlassPanel>
    );
  }

  if (!current) {
    return (
      <GlassPanel accent="routine" className="min-h-[7rem]">
        <PanelHeader title="Right now" icon={<Clock3 className="h-4 w-4 text-accent-routine" />} />
        <div className="px-4 pb-4">
          <PanelEmpty
            icon={<Clock3 className="h-6 w-6" aria-hidden="true" />}
            title="Nothing running right now"
            description="No routine block is scheduled at this time. Your next one will show up here."
          />
        </div>
      </GlassPanel>
    );
  }

  const progress = calculateBlockProgress(
    current.startTime,
    current.endTime,
    // Same `tick` as the block selection above, so the ring and the "Right now"
    // card cannot disagree about which minute it is.
    wallClock(tick)
  );
  const pct = Math.max(0, Math.min(100, progress.percentage));
  const offset = CIRC * (1 - pct / 100);

  // The block's own colour becomes the accent, with a token fallback when the
  // user has not set one.
  const accent = current.color ?? 'var(--color-primary)';

  return (
    <GlassPanel accent="routine" className="h-full">
      <PanelHeader
        title="Right now"
        icon={<Clock3 className="h-4 w-4 text-accent-routine" aria-hidden="true" />}
        action={
          <span className="relative flex h-2 w-2" aria-label="In progress">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 motion-reduce:animate-none" style={{ background: accent }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: accent }} />
          </span>
        }
      />

      {/* Body padding matches the other /today cards: `p-4 sm:p-5`, so the
          bottom border sits as far from the content as the sides do. */}
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5 sm:flex-row sm:items-center">
        {/* Countdown ring */}
        <div className="relative shrink-0" style={{ width: RING, height: RING }}>
          <svg
            viewBox={`0 0 ${RING} ${RING}`}
            className="absolute inset-0 h-full w-full -rotate-90"
            role="img"
            aria-label={`${Math.round(pct)} percent of ${current.title} elapsed`}
          >
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-current text-muted/50"
            />
            <circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              stroke={accent}
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {current.icon && <span className="text-xl leading-none">{current.icon}</span>}
            <span className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
              {timeRemaining(progress.minutesRemaining)}
            </span>
            <span className="text-[10px] text-muted-foreground">left</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">
              {current.title}
            </h3>
            <Tag className="shrink-0" tone="muted">
              {current.startTime} – {current.endTime}
            </Tag>
          </div>

          {/*
            No `line-clamp`. It truncated a long block description to two lines
            and left the card short, which is the opposite of what this card
            should do: a routine block with a real description earns the space it
            needs, and — because the grid no longer pins rows — Day type below
            moves down accordingly instead of a fixed band appearing.
          */}
          {current.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {current.description}
            </p>
          )}

          {next ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="text-foreground">Next:</span>
              {next.icon && <span aria-hidden="true">{next.icon}</span>}
              <span className="font-medium text-foreground">{next.title}</span>
              <span>at {next.startTime}</span>
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Last block of the day.
            </p>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}

function timeRemaining(minutes: number): string {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
