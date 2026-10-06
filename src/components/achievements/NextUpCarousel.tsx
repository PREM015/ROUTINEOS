'use client';

/**
 * NextUpCarousel — the three badges closest to being earned.
 *
 * ## Why this is a carousel and not a grid
 *
 * A grid of the closest badges is fine at three items and wrong at six: a row of
 * equal cards gives every item the same weight, when the point of the section is
 * a *ranking*. The cards are ordered by closeness and sized to make that ordering
 * legible, with the single most-achievable one promoted.
 *
 * On a phone they become a horizontal snap scroller, because three 300px cards do
 * not fit in 375px and shrinking them to fit would put a 7-character label on two
 * lines. Snapping is what makes a horizontal scroller feel deliberate rather than
 * accidental.
 *
 * ## Untracked badges never appear here
 *
 * A badge whose criterion the app cannot measure has no position in a "closest to"
 * ranking, so showing it with a fabricated percentage would be inventing data on a
 * rewards page. The empty state says so rather than filling the row with zeroes.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  rarityInk,
  type AchievementCategory,
} from '@/lib/constants/achievements';
import type { AchievementTile } from '@/lib/achievements/view-model';
import { remainingPhrase } from '@/lib/achievements/derived';
import { AchievementRing } from './AchievementRing';
import { cn } from '@/lib/utils';

/**
 * Where the action for each category actually lives.
 *
 * Every href is a real route - there is no `/sleep` in this app, sleep data lives
 * under `/wellness` - because a "Go to…" button that 404s is worse than none.
 */
export const CATEGORY_ACTION: Readonly<Record<AchievementCategory, { href: string; label: string }>> =
  {
    HABITS: { href: '/habits', label: 'Go to Habits' },
    GOALS: { href: '/goals', label: 'Go to Goals' },
    CONSISTENCY: { href: '/today', label: 'Go to Today' },
    LIFESTYLE: { href: '/wellness', label: 'Go to Wellness' },
    MASTERY: { href: '/focus', label: 'Go to Focus' },
    MILESTONES: { href: '/dashboard', label: 'Go to Dashboard' },
    CUSTOM: { href: '/today', label: 'Go to Today' },
  };

/** At or above this percentage a badge gets the "almost there" accent. */
export const ALMOST_THERE_PERCENT = 80;

export interface NextUpCarouselProps {
  /** Closest unearned tiles, already ordered by the view model. */
  tiles: readonly AchievementTile[];
  /** The criterion field per id, so the remaining phrase uses the right unit. */
  fieldFor?: (tile: AchievementTile) => string | undefined;
  onSelect?: (tile: AchievementTile) => void;
  /** True when the progress part of the payload was unavailable. */
  progressUnavailable?: boolean;
}

/** At most six: past that the ranking stops being a shortlist. */
const MAX_CARDS = 6;

export function NextUpCarousel({
  tiles,
  fieldFor,
  onSelect,
  progressUnavailable = false,
}: NextUpCarouselProps) {
  const measurable = tiles
    .filter((tile) => !tile.unlocked && tile.percent !== null)
    .slice(0, MAX_CARDS);

  if (measurable.length === 0) {
    /*
     * Two different absences with two different messages. "Everything earned" is a
     * completion state worth showing; "nothing measurable" is a limitation of the
     * app, and conflating them would tell a user with 3 of 20 badges that they
     * have finished.
     */
    const allEarned = tiles.length > 0 && tiles.every((tile) => tile.unlocked);
    if (allEarned) {
      return (
        <p className="rounded-xl border border-[color-mix(in_oklab,var(--accent-gold)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent-gold)_8%,transparent)] px-4 py-3 text-sm text-foreground">
          Every badge in the catalogue is unlocked. New ones will appear here as they are added.
        </p>
      );
    }
    if (progressUnavailable) {
      return (
        <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          Progress toward these badges is unavailable right now, so they are not ranked here.
          They still unlock automatically when you meet the condition.
        </p>
      );
    }
    return null;
  }

  return (
    <section aria-labelledby="next-up-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="next-up-heading" className="text-sm font-semibold text-foreground">
          Closest to unlocking
        </h2>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {measurable.length} in reach
        </span>
      </div>

      {/*
        `snap-x` with `snap-start` on the cards is what makes this read as a
        carousel. `overflow-x-auto` alone gives a scrollbar and no expectation that
        the next card is a whole card away.
      */}
      <ul
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2',
          // No visible scrollbar: the snap points already communicate the affordance,
          // and a permanent track under a rewards row reads as clutter.
          'scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
      >
        {measurable.map((tile, index) => (
          <NextUpCard
            key={tile.id}
            tile={tile}
            index={index}
            field={fieldFor?.(tile)}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </section>
  );
}

function NextUpCard({
  tile,
  index,
  field,
  onSelect,
}: {
  tile: AchievementTile;
  index: number;
  field: string | undefined;
  onSelect?: (tile: AchievementTile) => void;
}) {
  const rarity = ACHIEVEMENT_RARITIES[tile.rarity];
  const category = ACHIEVEMENT_CATEGORIES[tile.category];
  const accent = tile.color || rarity.color;
  const almostThere = (tile.percent ?? 0) >= ALMOST_THERE_PERCENT;
  const remaining = remainingPhrase(field ?? '', tile.current, tile.target);
  const action = CATEGORY_ACTION[tile.category];

  return (
    <li className="w-[85%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]">
      {/*
        A category-tinted card. The category is the strongest predictor of where
        the work happens, so the card is coloured by where to go rather than by how
        rare the badge is — rarity is already on the ring and the chip.
      */}
      <div
        className={cn(
          'group flex h-full flex-col rounded-2xl border p-4',
          'transition-[transform,box-shadow,border-color] duration-200 ease-out',
          'hover:-translate-y-1 hover:shadow-lg',
          'motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0',
          almostThere
            ? 'border-[color-mix(in_oklab,var(--accent-gold)_50%,transparent)]'
            : 'border-[var(--ach-hairline)]'
        )}
        style={{
          backgroundColor: `color-mix(in oklab, ${category.color} 9%, var(--ach-surface-1))`,
        }}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
            <AchievementRing
              percent={tile.percent}
              hue={accent}
              size="sm"
              index={index}
              label={`${tile.name}, ${tile.current} of ${tile.target}`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute flex h-6 w-6 items-center justify-center text-sm opacity-75 grayscale"
            >
              {tile.icon}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onSelect?.(tile)}
              className="block max-w-full truncate text-left text-sm font-semibold text-foreground transition-colors hover:text-[var(--accent-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              title={tile.name}
            >
              {tile.name}
            </button>
            <p className="truncate text-[11px] text-muted-foreground">{category.label}</p>
          </div>
        </div>

        <div className="mt-3.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {tile.current}
              <span className="text-muted-foreground">/{tile.target}</span>
            </p>
            {remaining && (
              <p
                className={cn(
                  'truncate text-[11px]',
                  almostThere ? 'font-medium text-[var(--accent-gold)]' : 'text-muted-foreground'
                )}
              >
                {remaining}
              </p>
            )}
          </div>
          {almostThere ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--accent-gold)_22%,transparent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--accent-gold)]">
              Almost there
            </span>
          ) : (
            <span
              className="shrink-0 text-[10px] font-semibold"
              style={{ color: rarityInk(rarity.color) }}
            >
              {rarity.icon} {rarity.label}
            </span>
          )}
        </div>

        <Link
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg border border-[var(--ach-hairline)] bg-[var(--ach-surface-1)] px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-[var(--ach-hairline-strong)] hover:bg-[var(--ach-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
        >
          {action.label}
          <ArrowRight
            className="h-3 w-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      </div>
    </li>
  );
}