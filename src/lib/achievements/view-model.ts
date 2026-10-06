/**
 * The achievements page's view model.
 *
 * ## Why this is a pure module
 *
 * `/achievements` used to derive everything itself, in the client component: two
 * requests (`/api/achievements` for the earned rows, `/api/achievements/next` for
 * locked progress), then a local block that re-resolved each row's rarity through
 * `xpForRow`, rebuilt the XP total, and re-derived the rarity counts. The dashboard
 * card meanwhile asked `/api/achievements/showcase` and read the rarity the server
 * had already resolved.
 *
 * Two derivations of the same fact is two chances to disagree, and they did: the
 * page could show a badge as Common in the grid and Epic in the history. The page
 * now issues the **same single request** as the dashboard card and maps the payload
 * through this one function, so the trophy total, the rarity chips, the grid and
 * the history are reading the same numbers by construction rather than by review.
 *
 * ## Client safety
 *
 * This module deliberately imports **nothing** from `@/server/**`. The showcase
 * payload's TypeScript interfaces live on `AchievementService`, and a `'use
 * client'` file may not import from the server tree — it would pull Prisma into
 * the browser bundle. The shapes below are a hand-maintained mirror of
 * `AchievementShowcase` / `AchievementShowcaseItem`, exactly as
 * `AchievementsShowcase.tsx` already declares them locally. If the service
 * contract changes, this file is the second thing to update (the first is that
 * component).
 *
 * It is also importable with no environment, which is what lets
 * `tests/lib/achievement-view-model.test.ts` pin the ordering and the
 * "not measurable" rules without a database.
 */

import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_RARITIES,
  type AchievementCategory,
  type AchievementRarity,
} from '@/lib/constants/achievements';
import { ACHIEVEMENT_XP, computeTrophyLevel, type TrophyLevelInfo } from './xp';

/** Mirror of `AchievementShowcaseItem`. See the module note on client safety. */
export interface ShowcaseItem {
  state: 'UNLOCKED' | 'IN_PROGRESS' | 'LOCKED';
  id: string;
  recordId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  level: number;
  current: number | null;
  target: number | null;
  percent: number | null;
  unlockedAt: string | null;
  celebrated: boolean;
}

/** Mirror of `AchievementShowcase`. */
export interface ShowcasePayload {
  unlocked: ShowcaseItem[];
  locked: ShowcaseItem[];
  counts: {
    unlocked: number;
    inProgress: number;
    locked: number;
    total: number;
  };
}

/** Rarity, rarest last. The canonical display and sort order. */
export const RARITY_ORDER: readonly AchievementRarity[] = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
];

/** Index into {@link RARITY_ORDER}; used for "sort by rarity" (rarest first). */
export const RARITY_RANK: Readonly<Record<AchievementRarity, number>> = RARITY_ORDER.reduce(
  (acc, rarity, index) => {
    acc[rarity] = index;
    return acc;
  },
  {} as Record<AchievementRarity, number>
);

export type AchievementTileState = 'UNLOCKED' | 'IN_PROGRESS' | 'LOCKED';

export interface AchievementTile {
  id: string;
  recordId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  state: AchievementTileState;
  unlocked: boolean;
  /**
   * Unlocked but not yet marked seen. Backed by the real `celebrated` column, so
   * it survives a reload and follows the user to another device — unlike a
   * localStorage "have I seen this" flag, which is per browser.
   */
  isNew: boolean;
  /** `null` means the app cannot measure this criterion. Distinct from `0`. */
  current: number | null;
  target: number | null;
  percent: number | null;
  /** Units left before the unlock; `null` when unmeasurable. */
  remaining: number | null;
  unlockedAt: string | null;
  /** XP this badge contributed. Derived from rarity, never stored. */
  xp: number;
}

export interface AchievementViewModel {
  /** Every tile, earned first then closest-to-earned. */
  tiles: AchievementTile[];
  earned: AchievementTile[];
  /** The closest measurable unearned tiles, best candidate first. */
  nextUp: AchievementTile[];
  /** Day-grouped unlock history, newest day first. */
  history: AchievementHistoryGroup[];
  totalXp: number;
  levelInfo: TrophyLevelInfo;
  rarityCounts: Record<AchievementRarity, number>;
  unseenCount: number;
  /** No unlocks at all — the page earns a teaching state, not an empty grid. */
  isFirstRun: boolean;
  /** At least one locked badge whose criterion the app cannot measure. */
  hasUnmeasurable: boolean;
}

export interface AchievementHistoryEntry {
  id: string;
  recordId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  xp: number;
  unlockedAt: string;
  /** `YYYY-MM-DD` in the user's own timezone. */
  dayKey: string;
}

export interface AchievementHistoryGroup {
  dayKey: string;
  entries: AchievementHistoryEntry[];
}

/**
 * Whether progress toward this tile can be shown at all.
 *
 * `current: null` is the service saying "this criterion is not tracked", and
 * `target: null`/non-positive means there is nothing to measure against. Both
 * render as an em dash rather than `0 / N`: a zero draws a progress bar on a badge
 * the user has not started, which is a claim the app cannot support.
 */
export function isMeasurable(item: {
  current: number | null;
  target: number | null;
}): boolean {
  return item.current !== null && item.target !== null && item.target > 0;
}

/** Convert one showcase item into a tile, resolving rarity-driven XP. */
export function toTile(item: ShowcaseItem): AchievementTile {
  const measurable = isMeasurable(item);
  const unlocked = item.state === 'UNLOCKED';
  const current = item.current ?? null;
  const target = item.target ?? null;

  return {
    id: item.id,
    recordId: item.recordId,
    name: item.name,
    description: item.description,
    icon: item.icon,
    color: item.color,
    category: item.category,
    rarity: item.rarity,
    state: item.state,
    unlocked,
    isNew: unlocked && !item.celebrated,
    current,
    target,
    // The service already sends a clamped percent; recomputing here would be a
    // second rounding rule that could disagree with the dashboard card.
    percent: measurable ? item.percent : null,
    remaining: measurable && target !== null && current !== null
      ? Math.max(0, target - current)
      : null,
    unlockedAt: item.unlockedAt,
    xp: ACHIEVEMENT_XP[item.rarity] ?? ACHIEVEMENT_XP.COMMON,
  };
}

/**
 * Closest-first, with unmeasurable tiles last.
 *
 * Unmeasurable sorts *last* deliberately. `null` percent is not 0%, so ordering it
 * among the measurable tiles would let a badge nobody can score outrank one the
 * user is two units from earning — and the "Next up" strip would then point at
 * something that can never move.
 */
export function byClosestFirst(a: AchievementTile, b: AchievementTile): number {
  if (a.percent === null && b.percent === null) return 0;
  if (a.percent === null) return 1;
  if (b.percent === null) return -1;
  if (a.percent !== b.percent) return b.percent - a.percent;
  return a.name.localeCompare(b.name);
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return keys.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Record<K, number>);
}

/**
 * The user's own calendar day for an instant, as `YYYY-MM-DD`.
 *
 * The history used to group with `toLocaleDateString(undefined, ...)`, which is
 * the *browser's* zone, so the same unlock could land in two different day
 * headings for two users in different zones — and a user travelling could see an
 * entry jump between groups. Passing the stored `settings.timezone` makes one
 * unlock belong to exactly one day for that user.
 *
 * `en-CA` yields `YYYY-MM-DD` from `Intl`, which is the one locale that formats
 * ISO-like; relying on that is deliberate, because the result is a sort key.
 */
export function dayKeyInZone(iso: string, timezone: string): string {
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
    // An invalid IANA zone throws rather than falling back. The browser's own
    // zone is the next-best answer and is always valid.
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

/** Group earned tiles into day buckets, newest day first, newest unlock first. */
export function groupHistoryByDay(
  earned: readonly AchievementTile[],
  timezone: string
): AchievementHistoryGroup[] {
  const groups = new Map<string, AchievementHistoryEntry[]>();

  for (const tile of earned) {
    if (!tile.unlockedAt) continue;
    const dayKey = dayKeyInZone(tile.unlockedAt, timezone);
    const entry: AchievementHistoryEntry = {
      id: tile.id,
      recordId: tile.recordId,
      name: tile.name,
      description: tile.description,
      icon: tile.icon,
      color: tile.color,
      category: tile.category,
      rarity: tile.rarity,
      xp: tile.xp,
      unlockedAt: tile.unlockedAt,
      dayKey,
    };
    const bucket = groups.get(dayKey);
    if (bucket) bucket.push(entry);
    else groups.set(dayKey, [entry]);
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dayKey, entries]) => ({
      dayKey,
      entries: entries.sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt)),
    }));
}

/**
 * Build everything the page renders from one showcase payload.
 *
 * `timezone` is the user's stored zone, used only for history grouping. It is a
 * parameter rather than a read of `Intl` so this stays pure and testable.
 */
export function buildAchievementViewModel(
  payload: ShowcasePayload,
  timezone: string
): AchievementViewModel {
  const earned = payload.unlocked.map(toTile);
  const locked = payload.locked.map(toTile).sort(byClosestFirst);
  const tiles = [...earned, ...locked];

  const totalXp = earned.reduce((sum, tile) => sum + tile.xp, 0);

  const rarityCounts = emptyCounts<AchievementRarity>(RARITY_ORDER);
  for (const tile of earned) {
    rarityCounts[tile.rarity] = (rarityCounts[tile.rarity] ?? 0) + 1;
  }

  const nextUp = locked.filter((tile) => tile.remaining !== null).slice(0, 3);

  return {
    tiles,
    earned,
    nextUp,
    history: groupHistoryByDay(earned, timezone),
    totalXp,
    levelInfo: computeTrophyLevel(totalXp),
    rarityCounts,
    unseenCount: earned.filter((tile) => tile.isNew).length,
    isFirstRun: earned.length === 0,
    hasUnmeasurable: locked.some((tile) => tile.percent === null),
  };
}

export type AchievementStatusFilter = 'ALL' | 'UNLOCKED' | 'LOCKED';
export type AchievementSort = 'DEFAULT' | 'CLOSEST' | 'RARITY' | 'RECENT' | 'NAME';

/**
 * How the collection is laid out.
 *
 * `SHELVES` groups by category with a completion line per shelf, `GRID` is the
 * flat tile wall, and `LIST` is a dense row per badge for scanning names. Held in
 * the URL rather than on the device, because the spec's acceptance criterion 6
 * lists "view" among the things that must survive a reload and be shareable - and
 * a shared link that silently reverts to a different layout is a broken link.
 */
export type AchievementView = 'SHELVES' | 'GRID' | 'LIST';

/** Tile padding. Comfortable is the default; compact fits more on a laptop. */
export type AchievementDensity = 'COMFORTABLE' | 'COMPACT';

export interface AchievementFilters {
  status: AchievementStatusFilter;
  rarity: 'ALL' | AchievementRarity;
  category: 'ALL' | AchievementCategory;
  sort: AchievementSort;
  /** Free-text search over name and description. Empty means no query. */
  query: string;
}

export const DEFAULT_FILTERS: AchievementFilters = {
  status: 'ALL',
  rarity: 'ALL',
  category: 'ALL',
  sort: 'DEFAULT',
  query: '',
};

export function isDefaultFilters(filters: AchievementFilters): boolean {
  return (
    filters.status === 'ALL' &&
    filters.rarity === 'ALL' &&
    filters.category === 'ALL' &&
    filters.sort === 'DEFAULT' &&
    filters.query.trim() === ''
  );
}

/** True when the value is one this module knows how to render. */
export function isAchievementStatusFilter(value: string): value is AchievementStatusFilter {
  return value === 'ALL' || value === 'UNLOCKED' || value === 'LOCKED';
}

export function isAchievementSort(value: string): value is AchievementSort {
  return (
    value === 'DEFAULT' ||
    value === 'CLOSEST' ||
    value === 'RARITY' ||
    value === 'RECENT' ||
    value === 'NAME'
  );
}

export function isAchievementView(value: string): value is AchievementView {
  return value === 'SHELVES' || value === 'GRID' || value === 'LIST';
}

export function isAchievementDensity(value: string): value is AchievementDensity {
  return value === 'COMFORTABLE' || value === 'COMPACT';
}

/**
 * `own` rather than a hardcoded list, so a palette entry is usable as a filter the
 * moment it is added, and an unknown one degrades to "no filter" instead of
 * narrowing the gallery to nothing.
 */
export function isAchievementRarity(value: string): value is AchievementRarity {
  return Object.prototype.hasOwnProperty.call(ACHIEVEMENT_RARITIES, value);
}

export function isAchievementCategory(value: string): value is AchievementCategory {
  return Object.prototype.hasOwnProperty.call(ACHIEVEMENT_CATEGORIES, value);
}

/**
 * Whether a tile matches a free-text query.
 *
 * Name and description only, case-insensitive, whitespace-tolerant. Deliberately
 * not the category or rarity: someone typing "epic" is asking about a tier, and
 * the rarity filter already answers that exactly - matching it here too would make
 * the two controls fight each other.
 *
 * An empty or whitespace-only query matches everything, so the control can be
 * cleared without leaving the gallery in a filtered state.
 */
export function matchesQuery(tile: AchievementTile, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    tile.name.toLowerCase().includes(needle) ||
    tile.description.toLowerCase().includes(needle)
  );
}

/**
 * Apply the filter bar and the sort.
 *
 * `DEFAULT` is the order the view model already produced (earned first, then
 * closest), so "no sort chosen" costs nothing and never reshuffles under the
 * user. The other choices are explicit.
 */
export function filterAndSortTiles(
  tiles: readonly AchievementTile[],
  filters: AchievementFilters
): AchievementTile[] {
  const filtered = tiles.filter((tile) => {
    if (filters.status === 'UNLOCKED' && !tile.unlocked) return false;
    if (filters.status === 'LOCKED' && tile.unlocked) return false;
    if (filters.rarity !== 'ALL' && tile.rarity !== filters.rarity) return false;
    if (filters.category !== 'ALL' && tile.category !== filters.category) return false;
    if (!matchesQuery(tile, filters.query)) return false;
    return true;
  });

  switch (filters.sort) {
    case 'CLOSEST':
      // Closest is a question about the *unearned* set. Among earned tiles every
      // percent is 100 or null, so they sort after the ones still in reach rather
      // than pretending to be "closer" than they are.
      return [...filtered].sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
        return byClosestFirst(a, b);
      });
    case 'RARITY':
      return [...filtered].sort((a, b) => {
        const byRank = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
        if (byRank !== 0) return byRank;
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    case 'RECENT':
      return [...filtered].sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? '');
      });
    case 'NAME':
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    case 'DEFAULT':
    default:
      return filtered;
  }
}