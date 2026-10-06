'use client';

/**
 * AchievementBadge — one achievement, as a tile the user can open.
 *
 * ## Why this is a button now
 *
 * It was a `<Card>` with an `aria-label`, which is the one thing that looks like
 * interactivity to a screen reader and is not: nothing was focusable, nothing
 * responded to Enter, and a locked badge gave no clue what it would take. A locked
 * badge exists to tell you what to go and do, so it is now a real `<button>` that
 * opens the detail drawer, with the status and rarity in its accessible name.
 *
 * ## The three states
 *
 * | State | Ring | Treatment | Readout |
 * | ----- | ---- | --------- | ------- |
 * | earned | complete + halo | gold border, holographic icon | unlock date, **New** until seen |
 * | in progress | partial | muted, icon in colour | `7 / 30`, `23 to go` |
 * | locked | track only | muted, icon desaturated | `Locked`, or `Not tracked` |
 *
 * "Not tracked" is a real state and not a failure to render. The service sends
 * `current: null` when a criterion cannot be measured, and showing `0 / 30` there
 * would draw a progress bar on a badge nobody has started - a claim the app
 * cannot support.
 *
 * ## Nothing is dimmed into invisibility
 *
 * A locked tile keeps full-contrast text. Reduced saturation on the *icon* is
 * enough to read the gallery as "mostly not yet earned" without making the name
 * unreadable, which is the part a user actually scans.
 */

import { Lock, Sparkles } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  rarityInk,
} from '@/lib/constants/achievements';
import type { AchievementTile } from '@/lib/achievements/view-model';
import { cn, formatDate } from '@/lib/utils';
import { AchievementRing } from './AchievementRing';

export interface AchievementBadgeProps {
  tile: AchievementTile;
  /** Ring index, for the staggered draw-on. */
  index?: number;
  /** Draws a focus ring, for a tile targeted by `?highlight=`. */
  highlighted?: boolean;
  /**
   * Tile padding. Owned here rather than passed as a `className` because the tile
   * already carries `p-4`; a caller-supplied `p-3` would be a second padding class
   * on the same element, and which one wins would come down to stylesheet order
   * rather than to intent.
   */
  density?: 'COMFORTABLE' | 'COMPACT';
  onSelect?: (tile: AchievementTile) => void;
  className?: string;
}

export function AchievementBadge({
  tile,
  index = 0,
  highlighted = false,
  density = 'COMFORTABLE',
  onSelect,
  className,
}: AchievementBadgeProps) {
  const rarity = ACHIEVEMENT_RARITIES[tile.rarity];
  const category = ACHIEVEMENT_CATEGORIES[tile.category];
  const accent = tile.color || rarity.color;

  const ringLabel = tile.unlocked
    ? `${tile.name}, unlocked`
    : tile.percent === null
      ? `${tile.name}, locked, progress not tracked`
      : `${tile.name}, ${tile.current} of ${tile.target}`;

  const status = tile.unlocked ? 'unlocked' : tile.state === 'IN_PROGRESS' ? 'in progress' : 'locked';

return (
    <button
      type="button"
      onClick={() => onSelect?.(tile)}
      aria-label={`${tile.name} — ${status}, ${rarity.label}`}
      style={{ ['--ach-rarity' as string]: accent }}
      className={cn(
        'ach-rarity-rim group relative flex h-full w-full flex-col rounded-2xl text-left',
        density === 'COMPACT' ? 'p-3' : 'p-4',
        // Elevation from the shared ramp, not from `bg-card`. The old tile sat on
        // `--card` (`#101014`) against a `#0a0a0f` page - a 1.5% lightness step that
        // is invisible, so the grid read as one flat mass. `ach-panel-raised` puts
        // the tile a real step above the page and gives hover somewhere to go.
        tile.unlocked ? 'ach-panel-raised' : 'ach-panel',
        'transition-[transform,border-color,box-shadow] duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-[var(--ach-hairline-strong)] hover:shadow-lg',
        'motion-reduce:transform-none motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        'active:translate-y-0 active:scale-[0.99] motion-reduce:active:scale-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        highlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className
      )}
    >
      {/*
        The "new" marker is the `celebrated` column, not client state, so it
        follows the user to another device and survives a reload. It is `sr-only`
        as well as visible, because the dot alone says nothing to a screen reader.
      */}
      {tile.isNew && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--accent-gold)_20%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent-gold)]">
          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
          New
        </span>
      )}

      <div className="flex items-start gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          {/*
            The ring wears the tile's **own rarity** in every state.

            It used to be gold for anything unlocked, so a Common first-streak and
            a Legendary four-week run drew the identical ring - which flattened the
            page's main hierarchy device at exactly the moment it mattered. Gold is
            still the hero's accent, but here the tier's colour is the signal.
          */}
          <AchievementRing
            percent={tile.unlocked ? 100 : tile.percent}
            hue={accent}
            size="sm"
            complete={tile.unlocked}
            index={index}
            label={ringLabel}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-200',
              'group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100',
              tile.unlocked
                ? 'shimmer-holographic overflow-hidden'
                : 'opacity-55 grayscale transition-opacity group-hover:opacity-85 motion-reduce:transition-none'
            )}
          >
            <span className="text-sm leading-none">{tile.icon}</span>
          </span>
        </div>

        <div className="min-w-0 flex-1 pr-8">
          <h3 className="truncate text-sm font-semibold text-foreground" title={tile.name}>
            {tile.name}
          </h3>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: category.color }}>
            {category.label}
          </p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-xs leading-snug text-muted-foreground">
        {tile.description}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
        <div className="min-w-0">
          {tile.unlocked && tile.unlockedAt ? (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatDate(new Date(tile.unlockedAt))}
            </p>
          ) : tile.percent === null ? (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Not tracked
            </p>
          ) : (
            <p className="text-[11px] tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">
                {tile.current}/{tile.target}
              </span>
              {tile.remaining === 1 ? ' · 1 to go' : tile.remaining ? ` · ${tile.remaining} to go` : ' · Ready'}
            </p>
          )}
        </div>
        <span
          className="ach-rarity-tag shrink-0 text-[10px] font-semibold"
          style={
            {
              '--ach-rarity': rarity.color,
              color: rarityInk(rarity.color),
            } as React.CSSProperties
          }
        >
          {rarity.icon} {rarity.label}
        </span>
      </div>
    </button>
  );
}

export default AchievementBadge;