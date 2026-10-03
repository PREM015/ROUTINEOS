'use client';

import { CalendarClock, Pencil, Repeat2 } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui';
import { formatDuration } from '@/lib/routine/duration';
import { useCountUp } from '@/components/motion/useCountUp';
import type { ResolvedDayScore, ResolvedDailyRoutine } from '@/types/routine';

/**
 * The header: which day this is, what kind of day it resolved to, and the three
 * numbers.
 *
 * Three numbers, not five. "Done / tracked", "time left today" and "free time"
 * are the three questions someone opening this page actually has; the score's
 * own rate lives in the rail, labelled, where it cannot be mistaken for one of
 * them.
 */
export function RoutineHero({
  isToday,
  dayTypeName,
  dayTypeSource,
  dayTypeColor,
  dayTypeIcon,
  trackedDone,
  trackedTotal,
  minutesRemainingToday,
  freeMinutes,
  score,
  onEditDayType,
  onChangeDayType,
}: {
  isToday: boolean;
  dayTypeName: string | null;
  dayTypeSource: ResolvedDailyRoutine['dayTypeSource'];
  dayTypeColor: string | null;
  dayTypeIcon: string | null;
  trackedDone: number;
  trackedTotal: number;
  /** Minutes of tracked blocks still to come today. `null` off today. */
  minutesRemainingToday: number | null;
  freeMinutes: number;
  score: ResolvedDayScore | null;
  onEditDayType: () => void;
  onChangeDayType: () => void;
}) {
  const reduce = useReducedMotion();

  return (
    <section
      aria-label="Day summary"
      className="glass-panel relative overflow-hidden rounded-2xl border border-border/60 p-5 sm:p-6"
    >
      {/*
        A wash of the resolved day type's own colour, bled in from the top-right.
        The colour is the user's — it is their day-type colour — so this is not
        invented decoration, it is the day announcing itself.
      */}
      {dayTypeColor && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full blur-3xl"
          style={{ backgroundColor: dayTypeColor, opacity: 0.18 }}
        />
      )}

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {/* Resolved day type, with where it came from. The source matters: a
              day silently overridden by a `RoutineException` looks identical to
              a natural weekday otherwise, and "why is my schedule different?"
              is unanswerable without it. */}
          <div className="flex flex-wrap items-center gap-2">
            {/*
              The day type is the subject of the page, so it gets the one piece
              of expressive typography on it: a clipped gradient sweep through
              the user's own colour. `bg-clip-text` + transparent fill is what
              makes the gradient legible; a gradient `background` on a pill with
              no text clip would wash the label out entirely.
            */}
            <span
              className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
              style={
                dayTypeColor
                  ? {
                      backgroundImage: `linear-gradient(100deg, ${dayTypeColor}, color-mix(in oklab, ${dayTypeColor} 45%, var(--foreground)) 55%, ${dayTypeColor})`,
                      backgroundSize: '200% 100%',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }
                  : undefined
              }
            >
              {dayTypeIcon && <span aria-hidden="true">{dayTypeIcon}</span>}
              <span className={dayTypeColor ? undefined : 'text-foreground'}>
                {dayTypeName ?? 'Day'}
              </span>
              {/*
                The gradient sweep. One pass on mount, not a loop: a continuously
                shimmering title is unreadable and pulls the eye off the schedule.
              */}
              {dayTypeColor && (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full opacity-0"
                  initial={reduce ? false : { opacity: 0.9 }}
                  animate={reduce ? { opacity: 0 } : { opacity: 0 }}
                  transition={{ duration: 1.1, delay: 0.15, ease: 'easeOut' }}
                  style={{
                    backgroundImage:
                      'linear-gradient(100deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)',
                    backgroundSize: '200% 100%',
                  }}
                />
              )}
            </span>

            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {dayTypeSource === 'EXCEPTION' ? (
                <>
                  <Repeat2 size={11} aria-hidden="true" />
                  Set for this date
                </>
              ) : (
                <>
                  <CalendarClock size={11} aria-hidden="true" />
                  Natural weekday
                </>
              )}
            </span>

            <Button variant="ghost" size="sm" onClick={onChangeDayType}>
              <Pencil size={12} />
              Change this day&apos;s type
            </Button>
          </div>

          {/*
            The page name is the smallest thing on the page, not the largest. It
            is not competing with the day's own title, and a 3xl bold "Routine"
            above three numbers pushed the actual content below the fold on a
            laptop.
          */}
          <h1 className="mt-3 font-display text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Routine
          </h1>
        </div>

        <dl className="grid shrink-0 grid-cols-3 divide-x divide-border">
          {/*
            "3 of 8 tracked", not "3/8" under a bare "Done".

            The slash form was ambiguous about what the denominator was, and this
            number sits on the same screen as the daily score's own routine rate,
            which has a *different* denominator. Spelling the denominator out in
            the label is what stops the two being read as one measurement — and
            it costs no extra chrome, which is the point (F2, fixed by
            restraint rather than by another widget).
          */}
          <HeroStat
            label="Done"
            value={String(trackedDone)}
            detail={trackedTotal === 0 ? 'nothing tracked' : `of ${trackedTotal} tracked`}
          />
          <HeroStat
            label={isToday ? 'Left today' : 'Left'}
            value={
              minutesRemainingToday === null ? '—' : formatDuration(minutesRemainingToday)
            }
            detail={isToday ? 'tracked time' : 'planning view'}
          />
          <HeroStat
            label="Free"
            value={formatDuration(freeMinutes)}
            detail="unscheduled"
          />
        </dl>
      </div>

      {score?.isRestDay && (
        <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          Marked as a rest day
          {score.restDayReason ? ` — ${score.restDayReason}` : ''}.{' '}
          <button
            type="button"
            onClick={onChangeDayType}
            className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Change
          </button>
        </p>
      )}

      {onEditDayType && dayTypeName && (
        <p className="mt-2 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={onEditDayType}
            className="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Edit the {dayTypeName} day type
          </button>
        </p>
      )}
    </section>
  );
}

function HeroStat({
  label,
  value,
  detail,
  numeric,
}: {
  label: string;
  value: string;
  detail: string;
  /** A bare number to count up to; omitted for `—` and pre-formatted values. */
  numeric?: number;
}) {
  const reduce = useReducedMotion();
  // `useCountUp` takes seconds. Zero duration under reduced motion, so the number
  // appears immediately rather than animating.
  const counted = useCountUp(numeric ?? 0, reduce ? 0 : 0.8);
  const shown = numeric === undefined ? value : Math.round(reduce ? numeric : counted);

  return (
    <div className="min-w-0 px-3 first:pl-0 sm:px-5 sm:first:pl-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-2xl font-semibold leading-none tabular-nums text-foreground sm:text-[28px]">
        {shown}
      </dd>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}