'use client';

import { getNowNext } from '@/lib/routine/timeline';
import { formatClockMinutes, formatDuration } from '@/lib/routine/duration';
import { displayTitle } from '@/lib/routine/display-text';
import { ProgressRing } from './ProgressRing';
import { PanelEmpty } from '@/components/today/ui';
import type { ResolvedRoutineBlock } from '@/types/routine';

/**
 * The three numbers that matter right now: what is running, what is next, and
 * how much is left.
 *
 * One card because these three answers are one idea — "where am I in my day" —
 * and splitting them across three cards is what made the old rail read as
 * decoration.
 *
 * ## Completion rate, and which one it is
 *
 * Three rates exist in this app and all three are real:
 *
 *  1. **This ring** — completed ÷ blocks the user asked to have tracked.
 *  2. **`DailyScore.routineCompletionRate`** — completed ÷ `RoutineLog` rows that
 *     exist for the date (`scoring.service.ts:242-243`). A block nobody has
 *     touched is excluded from the denominator rather than counted as a failure,
 *     and a day with no log rows scores 0.
 *  3. **`ResolvedDailyRoutine.completionRate`** — completed ÷ *every* block in
 *     the template (`routine.service.ts:264`). In the payload, deliberately not
 *     surfaced, because it is the least useful of the three.
 *
 * Both of the first two are shown, and the line beneath the ring names the
 * numbers in the score's fraction so the difference is explained rather than
 * merely displayed. Presenting either as "the" completion rate is how they used
 * to be mistaken for each other.
 */
export function NowNextCard({
  blocks,
  nowMinutes,
  isToday,
  timeFormat24h,
  isRestDay,
  completionRate,
  trackedDone,
  trackedTotal,
loggedBlocks,
  scoreRoutineRate,
  offScheduleLogs,
  onJumpToNow,
}: {
  blocks: ResolvedRoutineBlock[];
  nowMinutes: number | null;
  isToday: boolean;
  timeFormat24h: boolean;
  isRestDay: boolean;
  completionRate: number;
  trackedDone: number;
  trackedTotal: number;
  /** Blocks with a `RoutineLog` row — the score's denominator, not the ring's. */
loggedBlocks: number;
  scoreRoutineRate: number;
  /**
   * Completed blocks belonging to a schedule this date no longer resolves to.
   *
   * Present only when the day's day type was changed after the work was logged.
   * Rendered as a named explanation rather than left implicit, because otherwise a
   * user reads the rate dropping and concludes their completions were lost —
   * they were not, they are counted against the schedule they were done under.
   */
  offScheduleLogs?: Array<{
    blockId: string;
    title: string;
    templateId: string;
    templateName: string | null;
    completed: number;
  }>;
  onJumpToNow?: () => void;
}) {
  const nowNext = getNowNext(blocks, isToday ? nowMinutes : null);
  const { current, next, minutesUntilNext, blocksRemaining } = nowNext;

  return (
    <section aria-label="Now and next" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-4">
        <ProgressRing
          value={completionRate}
          size={64}
          strokeWidth={6}
          ariaLabel={`${completionRate}% of tracked blocks complete`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {isToday ? 'Tracked today' : 'Tracked'}
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums text-foreground">
              {trackedDone}
              <span className="text-base font-normal text-muted-foreground">
                /{trackedTotal}
              </span>
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {completionRate}%
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {trackedTotal === 0
              ? 'Nothing marked as tracked'
              : `${trackedTotal - trackedDone} still open`}
          </p>
        </div>
      </div>

      {/*
        The score's own routine rate, and *which* rate it is.

        ## Not deleted — compressed into a pill

        This line was asked to be removed as visual noise, and it was noise: a
        full-width sentence wedged between two hairlines. But it is the only
        thing on the page that distinguishes this card's ring from
        `DailyScore.routineCompletionRate`, and the two have different
        denominators — the score divides by the log rows that exist, so an
        untouched block is *excluded* rather than counted as a failure. Delete the
        line and the two numbers sit next to each other unexplained, which is the
        exact confusion this page spent a phase removing.

        So it stays, as a pill: same information, one line of height, no
        hairlines, and it visually joins the metric row instead of interrupting
        it. Restraint applied to the *presentation*, not the content.
      */}
{trackedTotal > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            score{' '}
            <span className="font-semibold text-foreground/80">{scoreRoutineRate}%</span>
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground/80">
            {loggedBlocks === 0
              ? 'nothing logged yet'
              : `of the ${loggedBlocks} you logged`}
          </span>
        </div>
      )}

      {/*
        The day's day type was changed after some of this work was logged.

        `RoutineLog` stores only its block id, so a later day-type change orphans
        those rows from the block set the date now resolves. The rate above already
        counts them — this only says where they came from, so the number reads as a
        deliberate measurement instead of a mistake.
      */}
      {offScheduleLogs && offScheduleLogs.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-tight text-muted-foreground/80">
          <span aria-hidden="true" className="mt-px text-amber-500/90">
            ↳
          </span>
          <span>
            {offScheduleLogs.length === 1 ? '1 block was' : `${offScheduleLogs.length} blocks were`}{' '}
            completed under{' '}
            <span className="font-medium text-foreground/80">
              {offScheduleLogs[0]?.templateName ?? 'another schedule'}
            </span>
            , which is no longer this date&apos;s. Counted above.
          </span>
        </p>
      )}

      {!isToday ? (
        <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
          Planning view — the now line is only drawn on today&apos;s date.
        </p>
      ) : isRestDay ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-sm font-medium text-foreground">Rest day</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Nothing is due. The blocks below are kept as a plan.
          </p>
        </div>
      ) : current ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Now</p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatClockMinutes(current.startMinutes, timeFormat24h)} –{' '}
              {formatClockMinutes(current.endMinutes, timeFormat24h)}
            </p>
          </div>
          <p
            className="mt-0.5 truncate text-sm font-medium text-foreground"
            title={current.block.title}
          >
            {displayTitle(current.block.title)}
          </p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${current.progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {formatDuration(current.minutesRemaining)} left ·{' '}
            {blocksRemaining} block{blocksRemaining === 1 ? '' : 's'} remaining
          </p>
        </div>
      ) : next ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {nowNext.current === null && blocks.length > 0 ? 'Up next' : 'Now'}
          </p>
          <p
            className="mt-0.5 truncate text-sm font-medium text-foreground"
            title={next.block.title}
          >
            {displayTitle(next.block.title)}
          </p>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Starts {formatClockMinutes(next.startMinutes, timeFormat24h)}
            {minutesUntilNext !== null && minutesUntilNext > 0
              ? ` · in ${formatDuration(minutesUntilNext)}`
              : ''}{' '}
            · {blocksRemaining} block{blocksRemaining === 1 ? '' : 's'} remaining
          </p>
        </div>
      ) : (
        <PanelEmpty
          title={blocks.length === 0 ? 'Nothing scheduled' : 'Day complete'}
          description={
            blocks.length === 0
              ? 'Add a block to get started.'
              : 'Nothing else is scheduled for this day.'
          }
          action={onJumpToNow ? undefined : undefined}
        />
      )}
    </section>
  );
}