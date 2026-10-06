'use client';

/**
 * AchievementList — the collection, in three layouts.
 *
 * ## Layouts
 *
 * | View | What it is for |
 * | ---- | -------------- |
 * | `SHELVES` | one section per category with an "earned of total" line |
 * | `GRID` | the flat tile wall |
 * | `LIST` | a dense row per badge, for scanning names |
 *
 * `SHELVES` is the default because a 20-item catalogue grouped by six categories
 * is far easier to reason about than one undifferentiated block.
 *
 * ## Families own their own members
 *
 * A tiered family (the five habit-streak badges, the four perfect-run badges) is
 * rendered as one ladder, and its members are then **excluded** from the shelves
 * and the grid. Showing both would put the same badge on screen twice with two
 * different-looking treatments, which is the confusing outcome this avoids.
 *
 * A ladder is shown when *any* of its rungs survives the current filters - so
 * filtering to RARE shows the ladder containing the RARE rung rather than hiding it
 * and leaving the user to wonder where "Month of Mastery" went.
 *
 * ## No filter bar here
 *
 * Filtering moved to `AchievementControlBar`. Two filter bars on one page is a
 * control the user has to reconcile, and this one used to hardcode light greys
 * that failed on the dark theme.
 */

import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  type AchievementCategory,
} from '@/lib/constants/achievements';
import { familyLadders, type FamilyLadder } from '@/lib/achievements/derived';
import {
  filterAndSortTiles,
  type AchievementDensity,
  type AchievementFilters,
  type AchievementTile,
  type AchievementView,
} from '@/lib/achievements/view-model';
import { EmptyState } from '@/components/ui/EmptyState';
import { rarityInk } from '@/lib/constants/achievements';
import { cn } from '@/lib/utils';
import { AchievementBadge } from './AchievementBadge';
import { FamilyLadderCard } from './FamilyLadderCard';

export interface AchievementListProps {
  tiles: readonly AchievementTile[];
  filters: AchievementFilters;
  view: AchievementView;
  density: AchievementDensity;
  highlightedId?: string | null;
  onSelect?: (tile: AchievementTile) => void;
  className?: string;
}

const GRID_COLUMNS =
  'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export function AchievementList({
  tiles,
  filters,
  view,
  density,
  highlightedId,
  onSelect,
  className,
}: AchievementListProps) {
  const visible = useMemo(() => filterAndSortTiles(tiles, filters), [tiles, filters]);

  /**
   * Which ladders survive the filters, and which tiles they take ownership of.
   *
   * Computed from `visible`, not from the unfiltered catalogue, so a filter
   * genuinely narrows the page instead of leaving ladders behind that ignore it.
   */
  const { ladders, ladderMemberIds } = useMemo(() => {
    const all = familyLadders(tiles);
    const visibleIds = new Set(visible.map((t) => t.id));
    const keep = all.filter((ladder) =>
      ladder.steps.some((step) => step.id !== '' && visibleIds.has(step.id))
    );
    const memberIds = new Set(keep.flatMap((l) => l.steps.map((s) => s.id)));
    return { ladders: keep, ladderMemberIds: memberIds };
  }, [tiles, visible]);

  const tilesById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);

  /** Everything the ladders do not own. */
  const remainder = useMemo(
    () => visible.filter((tile) => !ladderMemberIds.has(tile.id)),
    [visible, ladderMemberIds]
  );

  const renderTile = (tile: AchievementTile, index: number) => (
    <AchievementBadge
      key={tile.id}
      tile={tile}
      index={index}
      highlighted={tile.id === highlightedId}
      onSelect={onSelect}
    />
  );

  if (visible.length === 0) {
    // The recovery lives in `AchievementControlBar`, which owns the filters and so
    // is the only component that knows one is active. This message must never be
    // reused for a failed request - "no achievements match" blames the user's
    // filters for a network error.
    return (
      <EmptyState
        icon={
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
        }
        title="No achievements match"
        description="Nothing in the catalogue fits these filters. Clear them to see all badges."
      />
    );
  }

  if (view === 'LIST') {
    return (
      <div className={className}>
        <ListRows tiles={visible} onSelect={onSelect} />
      </div>
    );
  }

  const ladderSection =
    ladders.length > 0 && (
      <section aria-label="Tiered families">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ladders.map((ladder: FamilyLadder) => (
            <FamilyLadderCard
              key={ladder.family.id}
              ladder={ladder}
              tilesById={tilesById}
              onSelect={onSelect}
            />
          ))}
        </div>
      </section>
    );

  if (view === 'GRID') {
    return (
      <div className={cn('space-y-6', className)}>
        {ladderSection}
        <div className={`grid gap-3 ${GRID_COLUMNS}`}>{remainder.map(renderTile)}</div>
      </div>
    );
  }

  // SHELVES
  const shelves = groupByCategory(remainder);

  return (
    <div className={cn('space-y-8', className)}>
      {ladderSection}
      {shelves.map(([category, categoryTiles]) => {
        const config = ACHIEVEMENT_CATEGORIES[category];
        const earned = categoryTiles.filter((t) => t.unlocked).length;
        const percent = Math.round((earned / Math.max(1, categoryTiles.length)) * 100);
        return (
          <section key={category} aria-labelledby={`shelf-${category}`}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3
                id={`shelf-${category}`}
                className="flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <span aria-hidden="true">{config.icon}</span>
                {config.label}
              </h3>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {earned} / {categoryTiles.length}
              </span>
            </div>
            {/*
              The shelf line is a completion ratio, not XP: within a category the
              badges cost wildly different amounts, so a bar weighted by XP would
              show a shelf as nearly empty while its hardest badge sits earned.
            */}
            <div
              className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[var(--ach-surface-3)]"
              role="progressbar"
              aria-label={`${config.label} completion`}
              aria-valuenow={earned}
              aria-valuemin={0}
              aria-valuemax={categoryTiles.length}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{
                  width: `${percent}%`,
                  backgroundColor: config.color,
                }}
              />
            </div>
            <div className={`grid gap-3 ${GRID_COLUMNS}`}>
              {categoryTiles.map((tile, index) => (
                <AchievementBadge
                  key={tile.id}
                  tile={tile}
                  index={index}
                  density={density}
                  highlighted={tile.id === highlightedId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function groupByCategory(tiles: readonly AchievementTile[]): [AchievementCategory, AchievementTile[]][] {
  const map = new Map<AchievementCategory, AchievementTile[]>();
  for (const tile of tiles) {
    const bucket = map.get(tile.category);
    if (bucket) bucket.push(tile);
    else map.set(tile.category, [tile]);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Dense rows for `LIST`. Same data as the tile, arranged for scanning. */
function ListRows({
  tiles,
  onSelect,
}: {
  tiles: readonly AchievementTile[];
  onSelect?: (tile: AchievementTile) => void;
}) {
  return (
    <ul className="ach-panel divide-y divide-[var(--ach-hairline)] overflow-hidden rounded-2xl">
      {tiles.map((tile) => {
        const rarity = ACHIEVEMENT_RARITIES[tile.rarity];
        return (
          <li key={tile.id}>
            <button
              type="button"
              onClick={() => onSelect?.(tile)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 motion-reduce:transition-none"
            >
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${
                  tile.unlocked ? '' : 'opacity-55 grayscale'
                }`}
                style={{
                  backgroundColor: `color-mix(in oklab, ${tile.color || rarity.color} 16%, transparent)`,
                }}
              >
                {tile.icon}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">{tile.name}</span>
                  {tile.isNew && (
                    <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--accent-gold)_20%,transparent)] px-1.5 text-[9px] font-semibold uppercase text-[var(--accent-gold)]">
                      New
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {tile.description}
                </span>
              </span>

              <span className="hidden w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
                {tile.unlocked
                  ? 'Earned'
                  : tile.percent === null
                    ? 'Not tracked'
                    : `${tile.current}/${tile.target}`}
              </span>

              <span
                className="ach-rarity-tag ml-auto w-fit shrink-0 text-[10px] font-semibold"
                style={
                  {
                    '--ach-rarity': rarity.color,
                    color: rarityInk(rarity.color),
                  } as React.CSSProperties
                }
              >
                {rarity.icon} {rarity.label}
              </span>

              <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {tile.unlocked ? `+${tile.xp}` : '—'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
