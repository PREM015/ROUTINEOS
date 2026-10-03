'use client';

import { useMemo } from 'react';
import { formatDuration } from '@/lib/routine/duration';
import { summarizeDay } from '@/lib/routine/timeline';
import { cn } from '@/lib/utils';
import type { ResolvedRoutineBlock } from '@/types/routine';

/**
 * Where the day's time actually went.
 *
 * ## Why there is no 24-hour strip any more
 *
 * This card used to carry one — a proportional bar of the whole day with the
 * sleep window shaded behind it. It went through three iterations (`h-3`, then
 * `h-9` with inline segment labels and an hour axis) and it was the wrong idea
 * every time, for one reason: **it was a worse version of the thing the page
 * already does better.**
 *
 * The schedule column is the authoritative account of the day. Once it is a list
 * of rows in start order, every block already has its time, its duration and its
 * category printed on it, in order, legibly. A 24-hour strip compresses that same
 * information into 12 pixels of height, where a 20-minute block is a hairline, no
 * label fits, and the only way to read it is to hover and wait. It was
 * decoration competing with the real content, and it carried a header that said
 * "24-hour" twice.
 *
 * So it is gone, and what remains is the part that the strip was a bad way of
 * showing: a per-category breakdown where **each row's bar is proportional to
 * that category's share of the largest one**. That grammar — length means amount,
 * labelled in place, no legend — is the same one the week strip and the timeline
 * use, and it survives at this size.
 *
 * ## Relative, not absolute
 *
 * Bars are scaled to the *largest* category, not to a fixed 24 hours. The
 * question this card answers is "where did my time go", and that is a comparison
 * between categories; scaling to the day would make every bar look small and the
 * card would just be a worse clock.
 *
 * ## The sleep target is not here
 *
 * Sleep is tracked in the Sleep log, not as a routine block, so shading a sleep
 * window on a chart of *routine* blocks compared two different systems. The card
 * no longer takes `targetBedtime`/`targetWakeTime`, and the rail no longer
 * renders that caption.
 */
export function DayShapeBar({ blocks }: { blocks: ResolvedRoutineBlock[] }) {
  const summary = useMemo(() => summarizeDay(blocks), [blocks]);

  // The longest category, used as the 100% reference for every bar.
  const peak = useMemo(
    () => Math.max(...summary.categoryMix.map((entry) => entry.minutes), 1),
    [summary.categoryMix]
  );

  return (
    <section
      aria-label="Where the day went"
      className="glass-panel rounded-xl border border-border/60 p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Where the day went
        </h2>
        <span className="text-[10px] tabular-nums text-muted-foreground/70">
          {formatDuration(summary.scheduledMinutes)} scheduled
        </span>
      </div>

      {summary.categoryMix.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing scheduled yet, so there is nothing to break down.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {summary.categoryMix.map((entry) => (
            <li key={entry.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color ?? 'var(--muted-foreground)' }}
                  />
                  <span className="truncate text-xs text-foreground/90">{entry.name}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatDuration(entry.minutes)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full"
                  style={{
                    // A 4% floor so a one-minute category is still visibly a bar
                    // rather than an absent one.
                    width: `${Math.max(4, (entry.minutes / peak) * 100)}%`,
                    backgroundColor: entry.color ?? 'var(--muted-foreground)',
                    opacity: 0.85,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        <Stat label="Scheduled" value={formatDuration(summary.scheduledMinutes)} />
        <Stat label="Free" value={formatDuration(summary.freeMinutes)} />
        <Stat
          label="Longest gap"
          value={summary.longestGap ? formatDuration(summary.longestGap.minutes) : '—'}
        />
      </dl>

      {summary.energyMix.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-3">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            By energy
          </h3>
          <ul className="mt-2 space-y-1">
            {summary.energyMix.map((entry) => (
              <li key={entry.level}>
                <span className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-[11px]">
                  <EnergyDot level={entry.level} />
                  <span className="flex-1 capitalize text-foreground/90">
                    {entry.level.toLowerCase()}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatDuration(entry.minutes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.conflictCount > 0 && (
        <p className="mt-3 text-[11px] font-medium text-warning">
          {summary.conflictCount} overlapping pair
          {summary.conflictCount === 1 ? '' : 's'} today.
        </p>
      )}
    </section>
  );
}

/**
 * A status dot rather than a coloured pill.
 *
 * Energy is an *intensity*, and intensity is an axis — a row of three equal pills
 * gave no way to read "mostly high" at a glance. A dot plus a weight reads as a
 * scale, and the rows arrive high → low because the service emits them that way.
 */
function EnergyDot({ level }: { level: string }) {
  const color =
    level === 'HIGH'
      ? 'bg-destructive'
      : level === 'MEDIUM'
        ? 'bg-warning'
        : 'bg-muted-foreground/50';
  return <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', color)} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

export default DayShapeBar;
