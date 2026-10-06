'use client';

/**
 * TimelineView — unlock history as a journey, not a list.
 *
 * ## Month dividers and interleaved level milestones
 *
 * The existing history grouped by day in the user's timezone, which is correct but
 * loses the shape of a long history: three badges in one week and then nothing for
 * two months reads identically to three badges in one week and then nothing for two
 * days. Grouping by month restores that.
 *
 * **Level milestones are interleaved, not bolted on.** `derived.journeySeries`
 * returns a crossing for each threshold the user's cumulative XP actually passed,
 * tagged with the badge that carried them over. This places that badge's own row in
 * the timeline and hangs the milestone marker off it, so the marker cannot drift
 * away from the unlock that caused it — and a level can never appear in a month
 * where nothing was earned, because there is no row to hang it on.
 *
 * ## Ordering is deterministic
 *
 * History arrives oldest-first from `journeySeries`, and days are grouped by a
 * `YYYY-MM-DD` key that sorts lexicographically. There is no `Date` comparison and
 * no reliance on input order, so two renders of the same data produce the same
 * sequence even when several unlocks share an instant.
 *
 * ## Sparse histories
 *
 * One badge renders as one row under one month heading. No unlocks renders a
 * teaching empty state rather than an empty timeline.
 */

import { useMemo } from 'react';
import { Medal, Sparkles } from 'lucide-react';
import { ACHIEVEMENT_RARITIES, rarityInk } from '@/lib/constants/achievements';
import { earnedInUnlockOrder, journeySeries } from '@/lib/achievements/derived';
import type { AchievementTile } from '@/lib/achievements/view-model';
import { cn } from '@/lib/utils';

export interface TimelineViewProps {
  earned: readonly AchievementTile[];
  /** The user's stored timezone; days are the user's calendar days. */
  timezone: string;
  onSelect?: (tile: AchievementTile) => void;
  /** Tiles by id, so a history row can open the badge page. */
  tilesById?: ReadonlyMap<string, AchievementTile>;
}

interface TimelineRow {
  tile: AchievementTile;
  dayKey: string;
  /** Trophy level reached *by* this unlock, from the derived walk. */
  level: number;
  /** Set when this unlock carried the user across one or more thresholds. */
  reachedLevel: number | null;
}

export function TimelineView({ earned, timezone, onSelect, tilesById }: TimelineViewProps) {
  /**
   * One walk produces the rows, the levels and the crossings together, so a level
   * marker can only ever appear where the derived layer put it.
   */
  const { groups, total } = useMemo(() => {
    const ordered = earnedInUnlockOrder(earned);
    // Once, not per row: `journeySeries` walks every unlock, so calling it inside
    // the loop would make the timeline quadratic in the size of the history.
    const { points, crossings } = journeySeries(earned);

    /** definitionId → the highest level this unlock crossed. */
    const crossedById = new Map<string, number>();
    for (const crossing of crossings) {
      const current = crossedById.get(crossing.id) ?? 0;
      if (crossing.level > current) crossedById.set(crossing.id, crossing.level);
    }

    const rows: TimelineRow[] = ordered.map((tile, index) => ({
      tile,
      dayKey: dayKeyOf(tile.unlockedAt ?? '', timezone),
      // `points` is in the same order as `ordered` — both come from the same walk.
      level: points[index]?.level ?? 1,
      reachedLevel: crossedById.get(tile.id) ?? null,
    }));

    const byMonth = new Map<string, TimelineRow[]>();
    for (const row of rows) {
      const month = row.dayKey === 'unknown' ? 'Unknown' : row.dayKey.slice(0, 7);
      const bucket = byMonth.get(month);
      if (bucket) bucket.push(row);
      else byMonth.set(month, [row]);
    }

    return {
      // Newest month first, matching how the page reads: the recent past at the top.
      groups: [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      total: rows.length,
    };
  }, [earned, timezone]);

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <Medal className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-foreground">No unlocks yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Complete habits, goals and focus sessions — the first badge is close.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {groups.map(([month, rows]) => (
        <section key={month} aria-labelledby={`timeline-${month}`}>
          <div className="mb-3 flex items-center gap-3">
            <h3
              id={`timeline-${month}`}
              className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
            >
              {formatMonth(month)}
            </h3>
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-[var(--ach-hairline)]"
            />
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {rows.length} unlock{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          {/*
            The rail is a real element rather than a `border-left` on the list, so
            the node dots can sit on it with a negative offset and a background
            ring that masks the line behind them.
          */}
          <ol className="relative space-y-2 border-l border-[var(--ach-hairline)] pl-5">
            {rows.map((row) => {
              const rarity = ACHIEVEMENT_RARITIES[row.tile.rarity];
              const tile = tilesById?.get(row.tile.id) ?? row.tile;
              const accent = row.tile.color || rarity.color;
              const isMilestone = row.reachedLevel !== null;

              return (
                <li key={`${row.tile.recordId ?? row.tile.id}`} className="relative">
                  {/* Node on the rail, in the badge's own rarity. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute -left-[1.6rem] top-4 rounded-full ring-[3px] ring-[var(--background)]',
                      isMilestone ? 'h-3 w-3' : 'h-2 w-2'
                    )}
                    style={{
                      backgroundColor: accent,
                      boxShadow: isMilestone
                        ? `0 0 0 3px color-mix(in oklab, ${accent} 30%, transparent)`
                        : undefined,
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => onSelect?.(tile)}
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left',
                      'transition-[transform,border-color,box-shadow] duration-200 ease-out',
                      'hover:-translate-y-0.5 hover:border-[var(--ach-hairline-strong)] hover:shadow-md',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      'motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                      isMilestone
                        ? 'border-[color-mix(in_oklab,var(--accent-gold)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent-gold)_6%,var(--ach-surface-1))]'
                        : 'border-[var(--ach-hairline)] bg-[var(--ach-surface-1)]'
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition-transform duration-200',
                        'group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100',
                        row.tile.unlocked ? '' : 'opacity-55 grayscale'
                      )}
                      style={{
                        backgroundColor: `color-mix(in oklab, ${accent} 20%, transparent)`,
                        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 30%, transparent)`,
                      }}
                    >
                      {row.tile.icon}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {row.tile.name}
                        </span>
                        <span
                          className="shrink-0 text-[10px] font-semibold"
                          style={{ color: rarityInk(rarity.color) }}
                        >
                          {rarity.icon} {rarity.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {formatDay(row.dayKey)} · Level {row.level}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-[11px] font-semibold tabular-nums text-foreground">
                        +{row.tile.xp}
                      </span>
                      <span className="block text-[10px] tabular-nums text-muted-foreground">
                        XP
                      </span>
                    </span>
                  </button>

                  {/*
                    The milestone hangs off the unlock that caused it, so it cannot
                    drift into a month where nothing was earned. Rendered after the
                    row in document order because that is the reading order: the
                    badge, then what it got you.
                  */}
                  {isMilestone && (
                    <p className="mt-1.5 ml-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent-gold)]">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Reached trophy level {row.reachedLevel}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** `YYYY-MM-DD` for the user's own calendar day. */
function dayKeyOf(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

function formatMonth(month: string): string {
  if (month === 'Unknown') return 'Unknown date';
  const [y, m] = month.split('-');
  if (!y || !m) return month;
  // Parsed and formatted in UTC: the key is already a calendar month, and
  // re-projecting it into the browser's zone could shift it to the previous month.
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDay(dayKey: string): string {
  if (dayKey === 'unknown') return 'Unknown date';
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}