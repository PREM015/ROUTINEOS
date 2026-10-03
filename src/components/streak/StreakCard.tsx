'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { GlassPanel, PanelHeader, PanelSkeleton, Tag } from '@/components/today/ui';
import { useCelebration } from '@/components/today/celebration';
import { onTodayDataChanged } from '@/lib/today-sync';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  coreStreak: number;
  totalCompletedDays: number;
  streakStartDate: string | null;
}

const ARC_SIZE = 132;
const ARC_STROKE = 9;
const ARC_RADIUS = (ARC_SIZE - ARC_STROKE) / 2;
const ARC_CIRC = 2 * Math.PI * ARC_RADIUS;

export function StreakCard() {
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * A failed load is reported rather than hidden.
   *
   * The card previously did `if (!streak) return null` for both "still
   * loading" and "the request failed", and never checked `res.ok`. A 500 or an
   * expired session made the streak card silently disappear from `/today` with
   * no gap and no message — indistinguishable from a deliberate hide.
   */
  const [error, setError] = useState<string | null>(null);

  /**
   * 2.5 — full-screen celebration on a streak milestone.
   *
   * The helper existed but nothing ever called it, so the one moment the page
   * is meant to feel like an event was silent. It is fired from a *previous*
   * streak value in `localStorage` rather than on first load, because
   * `/api/streak` is refetched on every mount and after every habit log: firing
   * on "is this a milestone" alone would re-fire the burst every time the tab
   * re-rendered. Recording the last celebrated streak makes it fire once per
   * milestone, which is what "full-screen on streak milestone" has to mean.
   */
  const celebrate = useCelebration();
  const lastSeenStreak = useRef<number | null>(null);

  useEffect(() => {
    if (!streak) return;
    const current = streak.currentStreak;

    // First load of the session: remember it, but do not celebrate. A user
    // returning to a 30-day streak has not just achieved it.
    if (lastSeenStreak.current === null) {
      lastSeenStreak.current = current;
      try {
        window.localStorage.setItem('routineos.streak.celebrated', String(current));
      } catch {
        /* private mode: the in-memory ref still prevents a re-fire */
      }
      return;
    }

    const previous = lastSeenStreak.current;
    lastSeenStreak.current = current;
    if (current <= previous) return;

    let celebrated: number | null = null;
    try {
      celebrated = Number(window.localStorage.getItem('routineos.streak.celebrated'));
      if (Number.isNaN(celebrated)) celebrated = null;
    } catch {
      /* ignore */
    }
    const alreadyFired = celebrated !== null && current <= celebrated;
    if (alreadyFired) return;

    try {
      window.localStorage.setItem('routineos.streak.celebrated', String(current));
    } catch {
      /* ignore */
    }
    celebrate.streakMilestone(current);
  }, [streak, celebrate]);

  const fetchStreak = useCallback(
    async (options: { background?: boolean } = {}) => {
      /**
       * Background refetches keep the card mounted. Completing a habit moves
       * the streak server-side, so this card is told to re-read; collapsing to
       * `PanelSkeleton` each time would make the streak blink out and back on
       * every single tick.
       */
      if (!options.background) setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/streak');
        if (!res.ok) {
          throw new Error(`Could not load your streak (status ${res.status})`);
        }
        const data = await res.json();
        if (data.success) {
          setStreak(data.data);
        } else {
          throw new Error(data.error || 'Could not load your streak');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load your streak');
      } finally {
        if (!options.background) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void fetchStreak();
  }, [fetchStreak]);

  useEffect(
    () => onTodayDataChanged(() => void fetchStreak({ background: true })),
    [fetchStreak]
  );

  if (loading) return <PanelSkeleton rows={3} className="min-h-[12rem]" />;

  if (error) {
    return (
      <GlassPanel accent="streak" className="min-h-[7rem]">
        <PanelHeader
          title="Streak"
          icon={<Flame className="h-4 w-4 text-accent-streak" aria-hidden="true" />}
        />
        <div className="px-5 pb-5">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setLoading(true);
              void fetchStreak();
            }}
          >
            Try again
          </Button>
        </div>
      </GlassPanel>
    );
  }

  /**
   * `!streak` used to return `null`, which left a hole in the bento grid with
   * no explanation. It now renders an explicit state: a 0-day streak is a real
   * value, and "we could not tell you" is a different message.
   */
  if (!streak) {
    return (
      <GlassPanel accent="streak" className="min-h-[7rem]">
        <PanelHeader
          title="Streak"
          icon={<Flame className="h-4 w-4 text-accent-streak" aria-hidden="true" />}
        />
        <div className="flex flex-1 items-center px-5 pb-5">
          <p className="text-sm text-muted-foreground">
            No streak recorded yet. Log a habit to start one.
          </p>
        </div>
      </GlassPanel>
    );
  }

  const nextMilestone = getNextMilestone(streak.currentStreak);
  const progress = nextMilestone
    ? Math.min(100, (streak.currentStreak / nextMilestone.days) * 100)
    : 100;
  const daysToGo = nextMilestone
    ? Math.max(0, nextMilestone.days - streak.currentStreak)
    : 0;

  return (
      <GlassPanel accent="streak" className="h-full">
      <PanelHeader
        title="Streak"
        icon={<Flame className="h-4 w-4 text-accent-streak" aria-hidden="true" />}
        action={
          streak.currentStreak > 0 ? (
            <Tag tone="success">
              {streak.currentStreak} day{streak.currentStreak === 1 ? '' : 's'}
            </Tag>
          ) : (
            <Tag tone="muted">Not started</Tag>
          )
        }
      />

      <div className="flex flex-1 flex-col items-center gap-4 px-5 pb-5 sm:flex-row">
        {/* 2.6 — flame + milestone arc.
            The glow scales with the streak so a long streak is visually hotter,
            and the arc is a real SVG circle whose dash offset encodes progress
            toward the next milestone. */}
        <div className="relative shrink-0" style={{ width: ARC_SIZE, height: ARC_SIZE }}>
          <svg
            viewBox={`0 0 ${ARC_SIZE} ${ARC_SIZE}`}
            className="absolute inset-0 h-full w-full -rotate-90"
            role="img"
            aria-label={
              nextMilestone
                ? `${Math.round(progress)} percent toward ${nextMilestone.label}`
                : 'All milestones reached'
            }
          >
            <circle
              cx={ARC_SIZE / 2}
              cy={ARC_SIZE / 2}
              r={ARC_RADIUS}
              fill="none"
              strokeWidth={ARC_STROKE}
              className="stroke-current text-muted/50"
            />
            <MilestoneArc progress={progress} />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <StreakFlame streak={streak.currentStreak} />
            <span className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
              {streak.currentStreak}
            </span>
            <span className="text-[11px] text-muted-foreground">
              day{streak.currentStreak === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="w-full min-w-0 space-y-3">
          {nextMilestone ? (
            <div>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Next: <span className="font-medium text-foreground">{nextMilestone.label}</span>
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {daysToGo} to go
                </span>
              </div>
              {streak.currentStreak > 0 && streak.streakStartDate && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Started {formatDate(streak.streakStartDate)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Every milestone reached. That is a full year.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <dt className="text-[11px] text-muted-foreground">Longest</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {streak.longestStreak}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/50 px-2.5 py-2">
              <dt className="text-[11px] text-muted-foreground">Total days</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                {streak.totalCompletedDays}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </GlassPanel>
  );
}

/** The progress arc, animated on mount. */
function MilestoneArc({ progress }: { progress: number }) {
  const reduced = useReducedMotion();
  const offset = ARC_CIRC * (1 - Math.max(0, Math.min(100, progress)) / 100);

  return (
    <motion.circle
      cx={ARC_SIZE / 2}
      cy={ARC_SIZE / 2}
      r={ARC_RADIUS}
      fill="none"
      strokeWidth={ARC_STROKE}
      strokeLinecap="round"
      stroke="var(--color-primary)"
      strokeDasharray={ARC_CIRC}
      initial={{ strokeDashoffset: reduced ? offset : ARC_CIRC }}
      animate={{ strokeDashoffset: offset }}
      transition={{
        duration: reduced ? 0 : 1.1,
        ease: [0.16, 1, 0.3, 1],
      }}
    />
  );
}

/**
 * 2.6 — the flame's glow scales with the streak.
 *
 * Intensity is stepped rather than linear so a 3-day streak is not visually
 * identical to a 300-day one, and the pulse is a soft opacity/halo change
 * instead of a size change, so it cannot shift the layout.
 */
function StreakFlame({ streak }: { streak: number }) {
  const reduced = useReducedMotion();

  // 0 at 0 days, 1 at 30+, with intermediate steps at 3 / 7 / 14.
  const intensity =
    streak === 0 ? 0 : streak >= 30 ? 1 : streak >= 14 ? 0.8 : streak >= 7 ? 0.6 : streak >= 3 ? 0.35 : 0.2;

  return (
    <span className="relative inline-flex items-center justify-center">
      {intensity > 0 && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-orange-500/40 blur-md"
          animate={
            reduced
              ? { opacity: 0.3 * intensity, scale: 1 }
              : { opacity: [0.25, 0.55, 0.25].map((o) => o * intensity), scale: [1, 1.12, 1] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }
          }
        />
      )}
      <Flame
        className={cn(
          'relative h-6 w-6',
          intensity === 0
            ? 'text-muted-foreground/40'
            : intensity > 0.7
              ? 'text-orange-500'
              : 'text-orange-500/80'
        )}
        aria-hidden="true"
      />
    </span>
  );
}

function getNextMilestone(currentStreak: number): { days: number; label: string } | null {
  const milestones = [
    { days: 7, label: '1 week' },
    { days: 14, label: '2 weeks' },
    { days: 21, label: '3 weeks' },
    { days: 30, label: '1 month' },
    { days: 60, label: '2 months' },
    { days: 90, label: '3 months' },
    { days: 100, label: '100 days' },
    { days: 180, label: '6 months' },
    { days: 365, label: '1 year' },
  ];

  for (const milestone of milestones) {
    if (currentStreak < milestone.days) {
      return milestone;
    }
  }

  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}
