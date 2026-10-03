'use client';

import Link from 'next/link';
import { FolderKanban, CalendarClock } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PaceTrack } from './PaceTrack';
import { ConsistencyStrip } from './ConsistencyStrip';
import { MiniTrajectory } from './MiniTrajectory';
import { CheckInControl } from './CheckInControl';
import { PACE_COLOR, PACE_TEXT, PRIORITY_TICK, GOAL_PRIORITY_LABEL, GOAL_TYPE_LABEL } from '@/constants/goals';
import { dueLabel, formatValue, paceLabel, type GoalLike, type GoalPace } from '@/lib/goals/goal-metrics';
import type { ConsistencySummary } from '@/lib/goals/goal-metrics';

/**
 * ## The goal card
 *
 * This component used to be dead code: `page.tsx` defined its own private
 * `GoalCard` inline and shadowed it, which is why this file had sat unreachable
 * since it was written. The page now renders this one.
 *
 * ### What replaced what
 *
 * The old card led with a flat percentage bar — "73% complete" — which answers
 * nothing about whether 73% is good. It is replaced by the **Pace Track**
 * (progress against elapsed time) plus a one-line sentence naming the state in
 * words. Priority moved from a filled badge to a 3px tick in the corner, because
 * colour on this page encodes pace and only pace.
 *
 * ### Click target
 *
 * The whole card opens the drawer, so the per-card edit/delete buttons are gone
 * from here — they live in the drawer, where there is room for a real destructive
 * confirmation. A 44px row of three buttons on hover was never reachable on touch
 * anyway.
 */

export interface GoalCardView {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  priority: string;
  unit?: string | null;
  currentValue: number;
  targetValue: number;
  startDate: string;
  endDate: string;
  project?: { id: string; name: string; color?: string | null } | null;
  appliesEveryDay?: boolean;
  dayTypeNames?: string[];
}

export interface GoalCardProps {
  goal: GoalCardView;
  pace: GoalPace;
  consistency: ConsistencySummary;
  /**
   * `buildSparkline` output for this goal, pre-computed by the caller.
   *
   * Passed in rather than derived from raw progress rows so a grid of a dozen
   * cards does not run the same 30-day derivation twelve times per render. The
   * page already has the rows indexed by goal id.
   */
  goalShape?: Array<{ date: string; value: number | null }>;
  today: string;
  /** Only daily goals get the check-in control. */
  isDaily: boolean;
  doneToday?: boolean;
  busy?: boolean;
  onToggleCheckIn?: (goalId: string, next: boolean) => void;
  onOpen?: (goalId: string) => void;
  className?: string;
}

export function GoalCard({
  goal,
  pace,
  consistency,
  goalShape,
  today,
  isDaily,
  doneToday = false,
  busy = false,
  onToggleCheckIn,
  onOpen,
  className,
}: GoalCardProps) {
  const reduced = useReducedMotion();

  const due = dueLabel(goal, pace, today);
  const priority = goal.priority as keyof typeof PRIORITY_TICK;
  const priorityTick = PRIORITY_TICK[priority] ?? 'var(--muted-foreground)';

  return (
    <motion.article
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.98 }}
      transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 goals-pace-card',
        /*
          Depth is four layers, and only four. The surface tint and the chromatic
          border come from `.goals-pace-card`; this supplies the lift and the
          sheen.

          Hover lifts 1px and sweeps a single highlight across the face. The lift
          is not about elevation — every card is the same level and none of them
          is "above" another — it answers "which one am I pointing at", which on
          a tracker is a question worth a full row. The sheen is one-shot on
          hover and 600ms, per the one idea per card rule: two effects competing
          for the same gesture would both look weaker.

          Under reduced motion the lift is cancelled and the sheen never plays,
          leaving the border tint as the only hover cue. That is still a real
          cue — it changes colour, not just position.
        */
        'transition-[transform,box-shadow] duration-200 ease-out',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'hover:-translate-y-1 hover:shadow-floating motion-reduce:hover:shadow-none',
        className
      )}
      style={
        {
          '--pace-card-hue': PACE_COLOR[pace.state],
          '--pace-card-tint': tintFor(pace),
        } as React.CSSProperties
      }
    >
      {/*
        The hover sheen.

        A skewed white band translated across the card by a group-hover. It is a
        pseudo-element rather than an inline style so the whole thing is one
        compositor-friendly `transform` and nothing here touches layout.

        `hidden` under reduced motion rather than merely not-animated: a sheen
        that does not move is just a translucent rectangle sitting on the card.
      */}
      {!reduced && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden rounded-2xl motion-reduce:hidden"
        >
          <span className="absolute -inset-x-8 -top-8 h-[200%] -rotate-12 bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-0 transition-transform duration-700 ease-out group-hover:translate-x-[55%] motion-reduce:hidden" />
        </span>
      )}

      {/*
        The top wash — the strongest single use of the pace hue on the card.

        A gradient from the hue at 15% down to nothing over the top ~40%. It
        reads as light falling on the card from above rather than as a colour
        fill, which is what keeps a grid of a dozen of them calm instead of a
        paint box chart.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{
          background: `linear-gradient(to bottom, color-mix(in oklab, var(--pace-card-hue) 15%, transparent), transparent)`,
        }}
      />

      {/*
        The inner top rim: a 1px light line along the top edge in the pace hue.

        This is the cheapest thing that stops a flat card reading as flat, and
        it is why the routine capsules stopped looking like grey tiles. 1px, and
        it sits *inside* the border so it cannot change the card's geometry.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `color-mix(in oklab, var(--pace-card-hue) 42%, transparent)`,
        }}
      />

      {/*
        The ghost numeral — the card's largest element.

        The completion percentage, set at 8rem in the pace hue at 8% opacity,
        absolutely positioned behind the content and bled off the bottom edge by
        the card's `overflow-hidden`.

        It is `aria-hidden` because the figure is already announced by the Pace
        Track's `aria-valuetext`; announcing it twice would make every card
        verbose without making it more informative.

        Why it earns 8rem: the brief for this page is that *numbers are the
        heroes*, and before this a grid of twelve cards presented every figure
        at the same 14px weight, so scanning it meant reading twelve sentences.
        At this size the eye can find the two cards that matter — the 12% and
        the 96% — before a single word is read. It is also the one element that
        makes the grid read as a *dashboard* rather than a list.

        The bleed is deliberate. A numeral that stops cleanly inside the card
        reads as a badge; one that runs off the edge reads as a watermark, which
        is the register this page wants.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-5 right-1 select-none font-display text-[8rem] font-bold leading-none tracking-[-0.06em]"
        style={{ color: PACE_COLOR[pace.state], opacity: 0.08 }}
      >
        {pace.hasNoTarget ? '—' : Math.round(pace.progressShare * 100)}
      </span>

      {/*
        Every piece of real content in one positioned layer.

        The three decorative spans above are absolutely positioned and a
        positioned box paints above a static one in the same stacking context —
        so without this wrapper the ghost numeral and the top wash would sit on
        top of the goal title rather than behind it. Wrapping once is cleaner
        than adding `relative z-10` to four separate children, and it makes the
        rule obvious to anyone adding a fifth element later.
      */}
      <div className="relative z-10 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {isDaily && onToggleCheckIn && (
          <CheckInControl
            done={doneToday}
            busy={busy}
            goalTitle={goal.title}
            onToggle={(next) => onToggleCheckIn(goal.id, next)}
          />
        )}

        {/*
          The clickable region. A real `<button>` rather than an `onClick` on the
          article, so it is in the tab order, activates on Enter and Space, and
          carries an accessible name that describes the destination.
        */}
        <button
          type="button"
          onClick={() => onOpen?.(goal.id)}
          className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {goal.title}
            </h3>
            {/*
              Priority tick. Three pixels, in the corner, with the word beside it.
              It was a filled badge sharing colours with two other priorities;
              now it is a mark that cannot be confused with pace.
            */}
            <span className="flex shrink-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-3 w-[3px] rounded-full"
                style={{ background: priorityTick }}
              />
              <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {GOAL_PRIORITY_LABEL[priority] ?? priority}
              </span>
            </span>
          </div>

          {goal.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{goal.description}</p>
          )}
        </button>
      </div>

      {/*
        The hero figure, and the one line of pace prose.

        This is the card's primary content and it is deliberately the only place
        a figure is rendered at reading size. The ghost numeral behind it is the
        same number at 40x the scale and 8% opacity — the watermark lets you
        find the card, this lets you read it. Two renderings of one value, which
        is only defensible because exactly one of them is `aria-hidden`.

        `tabular-nums` so the figure does not shift width as progress is logged
        and the row re-renders. That jitter is the single most obvious "cheap"
        tell on a numeric dashboard.
      */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-3xl font-semibold tabular-nums leading-none text-foreground">
            {pace.hasNoTarget ? (
              <span className="text-muted-foreground">No target</span>
            ) : (
              <>
                {Math.round(pace.progressShare * 100)}
                <span className="text-lg text-muted-foreground">%</span>
              </>
            )}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {pace.hasNoTarget
              ? 'Set a target to measure pace'
              : `${formatValue(goal.currentValue)} of ${formatValue(goal.targetValue)}${
                  goal.unit ? ` ${goal.unit}` : ''
                }`}
          </p>
        </div>

        {/*
          The pace pill. Word + colour together, never colour alone — this is the
          WCAG 1.4.1 obligation, and it is also simply the fastest thing on the
          card to read. Tinted from the pace hue at 14% so it belongs to the
          card rather than floating on top of it.
        */}
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em]',
            PACE_TEXT[pace.state]
          )}
          style={{
            background: `color-mix(in oklab, var(--pace-card-hue) 15%, transparent)`,
          }}
        >
          {paceLabel(pace.state)}
        </span>
      </div>

      {/*
        The pace track, without its own numbers — the hero figure above now owns
        the percentage, and printing it twice on one card is how a card ends up
        saying the same thing in three type sizes.
      */}
      <PaceTrack pace={pace} title={goal.title} />

      {/*
        The trajectory, inline.

        The card already answers "where am I" — the hero figure and the pace track
        both do. What it did not answer is "which way am I going", which is the
        question the page's own name promises. The track shows a position, this
        shows a direction, and a goal at 40% climbing and a goal at 40% flat are
        completely different situations that render identically without it.

        It is `aria-hidden` and redundant with the drawer's larger copy on
        purpose: it exists for the glance, and a screen-reader user gets the same
        information stated rather than drawn.

        `goalShape` is passed pre-computed by the caller rather than taking raw
        `ProgressPoint[]`, because the series is the same 30 rows for every card
        and recomputing it inside each of a dozen cards is a dozen identical
        derivations per render.
      */}
      {goalShape && goalShape.some((p) => p.value !== null) && (
        <div className="relative -mx-1 h-9">
          <MiniTrajectory shape={goalShape} pace={pace} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <ConsistencyStrip summary={consistency} />
        <span
          className={cn(
            'shrink-0 text-[10px] uppercase tracking-[0.08em]',
            pace.state === 'overdue' ? PACE_TEXT.overdue : 'text-muted-foreground'
          )}
        >
          {due}
        </span>
      </div>

      {/*
        Relation chips. `projectId` and `dayTypeAssignments` were always in the
        `GET /api/goals` payload and always discarded by the client model, so a
        goal scoped to "Workdays" looked identical to one that applied every day
        and disagreed with `/today` about whether it applied at all.
      */}
      {(goal.project || (goal.dayTypeNames?.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {goal.project && (
            <Link
              href={`/projects/${goal.project.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {goal.project.color && (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: goal.project.color }}
                />
              )}
              <FolderKanban className="h-3 w-3" aria-hidden="true" />
              {goal.project.name}
            </Link>
          )}
          {!goal.appliesEveryDay && (goal.dayTypeNames?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              {goal.dayTypeNames?.join(' · ')}
            </span>
          )}
        </div>
      )}
      </div>
    </motion.article>
  );
}

/**
 * How much the pace hue tints a card's surface.
 *
 * A percentage string rather than a colour, so `.goals-pace-card` can mix it
 * against `--card` in CSS and light/dark each get the right result from one
 * number. Passed through `--pace-card-tint` on the element.
 *
 * The interesting case is `on_pace`: it gets the *most* tint of any state, not
 * the least. A goal that is exactly on schedule is the normal case and there
 * are usually many of them, so if "on pace" rendered as near-white the page would
 * be a wall of near-white. Its slate is quiet in *saturation* — not in presence.
 */
function tintFor(pace: GoalPace): string {
  if (pace.hasNoTarget) return '4%';
  switch (pace.state) {
    case 'behind':
      return '9%';
    case 'overdue':
      return '9%';
    case 'ahead':
      return '7%';
    case 'done':
      return '8%';
    case 'inactive':
      return '3%';
    case 'on_pace':
    default:
      return '6%';
  }
}

/** Type label for the card's meta row. Exported so the drawer can reuse it. */
export function typeLabel(type: string): string {
  return GOAL_TYPE_LABEL[type as keyof typeof GOAL_TYPE_LABEL] ?? type;
}

/** Re-exported so the page can label a rail without importing three modules. */
export { paceLabel };
export type { GoalLike };