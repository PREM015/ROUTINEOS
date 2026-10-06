/**
 * Derived views over the achievements a user has actually earned.
 *
 * ## Why this layer exists
 *
 * The Trophy Room spec asks for lifetime stats, a route to the next level, a
 * journey chart, level milestones, cadence, month-on-month and tiered family
 * ladders. Each of those is a *different fold* over the same set of unlock rows,
 * and every one of them risks disagreeing with the trophy hero.
 *
 * The hero already resolves XP through `computeTrophyLevel` and `ACHIEVEMENT_XP`.
 * If each derived view re-derives its own numbers, then the day a rarity is
 * renamed the chart keeps the old one and the level ring does not move - which is
 * exactly the class of bug acceptance criterion 1 is written against.
 *
 * So every function here takes the **already-mapped** tiles from
 * `buildAchievementViewModel` and reads `tile.xp` and `computeTrophyLevel`. There
 * is one XP resolver in this codebase and these functions refuse to introduce a
 * second.
 *
 * ## Client safety and testability
 *
 * Pure, no `@/server/**`, no `@/lib/prisma`. Every function runs with no
 * environment, which is what lets `tests/lib/achievement-derived.test.ts` pin the
 * milestone arithmetic and the copy without a database.
 *
 * ## Two rules these functions will not bend
 *
 * 1. **Untracked progress is never zero.** `current: null` renders as "not
 *    tracked", and a badge with no measurable progress never appears in a
 *    "closest" list - it has no position to be closest in.
 * 2. **Nothing here mutates earned state.** Families, grouping and sorting are
 *    presentation. No function in this module revokes, rescores or hides a badge.
 */

import { computeTrophyLevel, cumulativeXpForLevel, type TrophyLevelInfo } from './xp';
import { dayKeyInZone, type AchievementTile } from './view-model';
import type { AchievementCategory, AchievementRarity } from '@/lib/constants/achievements';

/** Rarity, commonest first. Used for "average rarity" and "rarest earned". */
const RARITY_ORDER_LOCAL: readonly AchievementRarity[] = [
  'COMMON',
  'UNCOMMON',
  'RARE',
  'EPIC',
  'LEGENDARY',
];

/**
 * The unit a criterion field counts in.
 *
 * Every one of these is countable and needs its own noun. "4 more" on its own is
 * the kind of copy that makes a progress feature feel unfinished, and guessing
 * wrong is worse than not showing it: "3 more days" under a sessions counter is a
 * factually wrong claim on a rewards page.
 */
const FIELD_UNITS: Readonly<Record<string, string>> = {
  streak: 'days',
  goalsCompleted: 'goals',
  dailyScore: 'points',
  earlyWakeups: 'early wake-ups',
  lateEvenings: 'late sessions',
  focusHours: 'hours',
  focusMinutes: 'minutes',
  wellnessLogs: 'check-ins',
  focusSessions: 'sessions',
  perfectDays: 'perfect days',
  perfectDayStreak: 'days in a row',
  perfectWeekStreak: 'weeks in a row',
  perfectWeeks: 'weeks',
  totalHabitLogs: 'habit logs',
  daysActive: 'active days',
  journalEntries: 'entries',
};

/** The noun for a field's unit, pluralised only for a count above one. */
export function unitForField(field: string, count: number): string {
  const unit = FIELD_UNITS[field] ?? 'steps';
  return count === 1 ? unit.replace(/s$/, '') : unit;
}

/**
 * "4 more days" / "1 more session" / "Ready".
 *
 * `null` when the criterion is unmeasurable, which the caller renders as "not
 * tracked" rather than as a zero - a zero would draw a progress bar on a badge
 * nobody has started.
 */
export function remainingPhrase(
  field: string,
  current: number | null,
  target: number | null
): string | null {
  if (current === null || target === null || target <= 0) return null;
  const remaining = Math.max(0, target - current);
  if (remaining === 0) return 'Ready';
  const unit = unitForField(field, remaining);
  return `${remaining} more ${unit}`;
}

/** The earned tiles, oldest unlock first. Exported because several folds need it. */
export function earnedInUnlockOrder(earned: readonly AchievementTile[]): AchievementTile[] {
  return earned
    .filter((tile) => tile.unlocked && typeof tile.unlockedAt === 'string')
    .sort((a, b) => (a.unlockedAt ?? '').localeCompare(b.unlockedAt ?? ''));
}

// ============================================================================
// Lifetime stats (AC3)
// ============================================================================

export interface LifetimeStats {
  firstUnlockAt: string;
  lastUnlockAt: string;
  /** The highest rarity earned, and a badge that has it. */
  rarest: { id: string; name: string; rarity: AchievementRarity };
  /** Mean rarity as a 0-4 index; `null` when nothing is earned. */
  averageRarityIndex: number;
  totalEarned: number;
  perCategory: { category: AchievementCategory; earned: number }[];
}

/**
 * Headline facts about the unlock history.
 *
 * `null` when nothing is earned, because the hero should render an explanation
 * instead of a row of zeroes and dashes - "first unlock —" is worse than no row.
 *
 * `averageRarityIndex` is the mean over the *rarities earned*, not over the
 * catalogue, so a user with three badges is not diluted by the seventeen they
 * have not earned yet.
 */
export function lifetimeStats(earned: readonly AchievementTile[]): LifetimeStats | null {
  const ordered = earnedInUnlockOrder(earned);
  const first = ordered[0];
  if (!first?.unlockedAt) return null;

  let rankSum = 0;
  let rarest: AchievementTile | null = null;
  let rarestRank = -1;
  const perCategory = new Map<AchievementCategory, number>();

  for (const tile of ordered) {
    const rank = RARITY_ORDER_LOCAL.indexOf(tile.rarity);
    rankSum += rank < 0 ? 0 : rank;
    if (rank > rarestRank) {
      rarestRank = rank;
      rarest = tile;
    }
    perCategory.set(tile.category, (perCategory.get(tile.category) ?? 0) + 1);
  }

  return {
    firstUnlockAt: first.unlockedAt,
    lastUnlockAt: ordered[ordered.length - 1]?.unlockedAt ?? first.unlockedAt,
    rarest: {
      id: rarest?.id ?? first.id,
      name: rarest?.name ?? first.name,
      rarity: rarest?.rarity ?? 'COMMON',
    },
    averageRarityIndex: ordered.length > 0 ? rankSum / ordered.length : 0,
    totalEarned: ordered.length,
    perCategory: [...perCategory.entries()]
      .map(([category, count]) => ({ category, earned: count }))
      .sort((a, b) => b.earned - a.earned),
  };
}

// ============================================================================
// Journey chart scaffolding (AC14)
// ============================================================================

export interface JourneyThreshold {
  level: number;
  /** Cumulative XP at which this level begins. */
  at: number;
}

/**
 * Level thresholds that fall inside the chart's own range.
 *
 * Drawn as horizontal bands behind the curve. The first level is deliberately
 * omitted: its threshold is 0 XP, which is the chart's origin rather than a
 * transition, and drawing a line there would imply the user "reached level 1" as
 * an event.
 *
 * Only thresholds the data actually reaches are returned, so the chart never draws
 * a band above the final cumulative XP — which would assert progress the user has
 * not made.
 */
export function journeyThresholds(
  finalCumulativeXp: number,
  maxLevel = 50
): JourneyThreshold[] {
  const thresholds: JourneyThreshold[] = [];
  for (let level = 2; level <= maxLevel; level += 1) {
    const at = cumulativeXpForLevel(level);
    if (at > finalCumulativeXp) break;
    thresholds.push({ level, at });
  }
  return thresholds;
}

// ============================================================================
// Cadence calendar (AC16)
// ============================================================================

export interface CadenceCell {
  /** `YYYY-MM-DD` in the user's timezone, or `null` for padding outside the month. */
  dayKey: string | null;
  /** 1 = Monday … 7 = Sunday. `null` for padding. */
  weekday: number | null;
  count: number;
  /**
   * Three honest buckets, not a percentage.
   *
   * `none` / `light` / `strong` rather than an intensity ramp, because "2 unlocks"
   * and "1 unlock" are the same kind of event and a gradient would imply otherwise.
   * Days with no record are `none`, which is **not** a failure: a day with no
   * unlock simply had no unlock.
   */
  level: 'none' | 'light' | 'strong';
}

export interface CadenceMonth {
  /** `YYYY-MM`. */
  month: string;
  /** Weeks of seven cells, Monday-first. Always 5 or 6 rows. */
  weeks: CadenceCell[][];
  total: number;
  activeDays: number;
  /** How many days in the month have any record at all. */
  daysInMonth: number;
}

/** One unlock is the typical good day; two or more is a genuine burst. */
export const CADENCE_STRONG_THRESHOLD = 2;

/** `YYYY-MM` shifted by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split('-');
  const y = Number(year);
  const base = Number(m);
  if (!Number.isFinite(y) || !Number.isFinite(base)) return month;
  const total = y * 12 + (base - 1) + delta;
  const outYear = Math.floor(total / 12);
  const outMonth = (total % 12) + 1;
  return `${outYear}-${String(outMonth).padStart(2, '0')}`;
}

/**
 * One month of unlock cadence as a Monday-first grid.
 *
 * Built from `dayKeyInZone` keys, which are already the user's calendar date.
 * The weekday is therefore derived by treating the key as a *date* in UTC rather
 * than as an instant — a key is "2026-03-10 in the user's zone", and re-projecting
 * it into a zone is what would move it to the wrong column.
 */
export function cadenceMonth(cadence: ReadonlyMap<string, number>, month: string): CadenceMonth {
  const [yearText, monthText] = month.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText);
  const daysInMonth =
    Number.isFinite(year) && Number.isFinite(monthIndex)
      ? new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
      : 30;
  const firstDay = `${month}-01`;

  // Monday-first: `weekStart` anchors on Monday, and getUTCDay() 0 is Sunday.
  const firstWeekday = (new Date(`${firstDay}T00:00:00Z`).getUTCDay() || 7) as number;

  const cells: CadenceCell[] = [];
  for (let pad = 1; pad < firstWeekday; pad += 1) {
    cells.push({ dayKey: null, weekday: null, count: 0, level: 'none' });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${month}-${String(day).padStart(2, '0')}`;
    const count = cadence.get(key) ?? 0;
    cells.push({
      dayKey: key,
      weekday: ((firstWeekday - 1 + day) % 7) + 1,
      count,
      level: count === 0 ? 'none' : count >= CADENCE_STRONG_THRESHOLD ? 'strong' : 'light',
    });
  }
  // Pad the final week so every row is a full seven.
  while (cells.length % 7 !== 0) {
    cells.push({ dayKey: null, weekday: null, count: 0, level: 'none' });
  }

  const weeks: CadenceCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  const monthCells = cells.filter((c) => c.dayKey !== null);
  return {
    month,
    weeks,
    total: monthCells.reduce((sum, c) => sum + c.count, 0),
    activeDays: monthCells.filter((c) => c.count > 0).length,
    daysInMonth,
  };
}

/**
 * Month-on-month, as a discriminated union.
 *
 * A UI that receives `null` has to invent its own "not enough data" copy, and the
 * likeliest invention is to show a comparison it cannot support. Returning a
 * `{ status: 'insufficient' }` variant makes the suppressed case impossible to
 * render as a comparison.
 */
export type MonthOnMonthModel =
  | { status: 'insufficient'; reason: 'no-history' | 'single-month' }
  | { status: 'ready'; thisMonth: number; lastMonth: number; delta: number };

export function monthOnMonthModel(
  earned: readonly AchievementTile[],
  timezone: string,
  today: string
): MonthOnMonthModel {
  const months = monthlyUnlockCounts(earned, timezone);
  if (months.length === 0) return { status: 'insufficient', reason: 'no-history' };
  const firstMonth = months[0]?.month;
  if (!firstMonth) return { status: 'insufficient', reason: 'no-history' };

  const thisMonth = today.slice(0, 7);
  if (monthsCovered(firstMonth, thisMonth) < MIN_MONTHS_FOR_TREND) {
    return { status: 'insufficient', reason: 'single-month' };
  }

  const previous = new Date(`${thisMonth}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const lastMonth = previous.toISOString().slice(0, 7);
  const countFor = (month: string) => months.find((m) => m.month === month)?.count ?? 0;
  const current = countFor(thisMonth);
  const prior = countFor(lastMonth);
  return { status: 'ready', thisMonth: current, lastMonth: prior, delta: current - prior };
}

export interface JourneyPoint {
  /** Catalogue id of the badge that moved the total. */
  id: string;
  name: string;
  rarity: AchievementRarity;
  icon: string;
  color: string;
  unlockedAt: string;
  xp: number;
  /** XP earned including this badge. */
  cumulativeXp: number;
  /** Trophy level at that point, from the shared resolver. */
  level: number;
}

export interface LevelCrossing {
  level: number;
  /** The badge whose unlock took the total across this threshold. */
  id: string;
  name: string;
  unlockedAt: string;
  cumulativeXp: number;
}

/** Below this, a "journey" is a list, not a curve. */
export const MIN_JOURNEY_UNLOCKS = 3;

/**
 * Cumulative XP by unlock, plus the level milestones it crosses.
 *
 * Both come from one walk in unlock order using `computeTrophyLevel` at each
 * step, so the level shown beside an unlock is by construction the level the hero
 * would have shown at that moment. Nothing is stored: the whole series is
 * recomputed from the unlock rows on each load, which is why a corrected rarity
 * moves the chart and the ring together.
 */
export function journeySeries(earned: readonly AchievementTile[]): {
  points: JourneyPoint[];
  crossings: LevelCrossing[];
} {
  const ordered = earnedInUnlockOrder(earned);
  const points: JourneyPoint[] = [];
  const crossings: LevelCrossing[] = [];
  let cumulative = 0;
  let previousLevel = 1;

  for (const tile of ordered) {
    cumulative += tile.xp;
    const levelInfo = computeTrophyLevel(cumulative);
    const point: JourneyPoint = {
      id: tile.id,
      name: tile.name,
      rarity: tile.rarity,
      icon: tile.icon,
      color: tile.color,
      unlockedAt: tile.unlockedAt ?? '',
      xp: tile.xp,
      cumulativeXp: cumulative,
      level: levelInfo.level,
    };
    points.push(point);

    // A single unlock can cross several thresholds at once (a big Legendary after
    // a long gap), so this is a `while`, not an `if`.
    for (let level = previousLevel + 1; level <= levelInfo.level; level += 1) {
      crossings.push({
        level,
        id: tile.id,
        name: tile.name,
        unlockedAt: tile.unlockedAt ?? '',
        cumulativeXp: cumulative,
      });
    }
    previousLevel = levelInfo.level;
  }

  return { points, crossings };
}

/** `YYYY-MM` unlock counts, oldest first, in the user's own timezone. */
export function monthlyUnlockCounts(
  earned: readonly AchievementTile[],
  timezone: string
): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const tile of earnedInUnlockOrder(earned)) {
    const day = dayKeyInZone(tile.unlockedAt ?? '', timezone);
    if (day === 'unknown') continue;
    const month = day.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Needs two distinct months before "month on month" means anything. */
export const MIN_MONTHS_FOR_TREND = 2;

/** Whole months from `from` to `to`; negative when `to` precedes `from`. */
export function monthSpan(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-');
  const [toYear, toMonth] = to.split('-');
  const fy = Number(fromYear);
  const fm = Number(fromMonth);
  const ty = Number(toYear);
  const tm = Number(toMonth);
  if (!Number.isFinite(fy) || !Number.isFinite(fm) || !Number.isFinite(ty) || !Number.isFinite(tm)) {
    return 0;
  }
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Calendar months a range touches, inclusive of both ends.
 *
 * January to February is **2**, not 1: the span in transitions is one, but the user
 * has history in both months and "fewer than two months of data" is about
 * coverage, not about how many month boundaries they crossed.
 */
export function monthsCovered(from: string, to: string): number {
  const span = monthSpan(from, to);
  return span < 0 ? 0 : span + 1;
}

/**
 * This month against last, from the user's calendar - not a trailing 30 days.
 *
 * "This month" is what a person means by it, and using a rolling window next to a
 * calendar-derived timeline would put two different definitions of "recent" on one
 * screen.
 *
 * The history threshold is the **span** from the first unlock to today, not the
 * number of months that happen to contain an unlock. Those differ exactly when a
 * user is on a run and then goes quiet: they have two months of real history and
 * one month of activity, and counting activity months hides the most useful thing
 * the card could say - that this month is currently zero.
 */
export function monthOnMonth(
  earned: readonly AchievementTile[],
  timezone: string,
  today: string
): { thisMonth: number; lastMonth: number; delta: number } | null {
  const months = monthlyUnlockCounts(earned, timezone);
  const firstMonth = months[0]?.month;
  if (!firstMonth) return null;

  const thisMonth = today.slice(0, 7);
  if (monthsCovered(firstMonth, thisMonth) < MIN_MONTHS_FOR_TREND) return null;

  const previous = new Date(`${thisMonth}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const lastMonth = previous.toISOString().slice(0, 7);
  const countFor = (month: string) => months.find((m) => m.month === month)?.count ?? 0;
  const current = countFor(thisMonth);
  const prior = countFor(lastMonth);
  return { thisMonth: current, lastMonth: prior, delta: current - prior };
}

/** Unlock counts keyed by `YYYY-MM-DD` in the user's timezone, for the calendar. */
export function cadenceByDay(
  earned: readonly AchievementTile[],
  timezone: string
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tile of earnedInUnlockOrder(earned)) {
    const day = dayKeyInZone(tile.unlockedAt ?? '', timezone);
    if (day === 'unknown') continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

// ============================================================================
// Route to the next level (AC2)
// ============================================================================

export interface NextLevelRoute {
  /** XP still required, from the shared level resolver. */
  xpRemaining: number;
  /** Unearned badges that could contribute toward the gap, closest first. */
  steps: { id: string; name: string; xp: number; rarity: AchievementRarity }[];
  /** True when the listed steps cannot cover the gap on their own. */
  shortfall: boolean;
}

/**
 * One possible route toward the next level.
 *
 * A **suggestion, not a plan.** The wording in the UI says "one possible route"
 * and must keep saying it: XP can also come from a badge not in the catalogue, a
 * catalogue addition, or a level rule change, so a route presented as *the* route
 * would be making a promise the data cannot keep.
 *
 * Only unearned badges with a real XP value are listed, closest first. If the gap
 * cannot be closed by the steps shown, `shortfall` is set rather than the list
 * being padded with badges that do not exist.
 */
export function nextLevelRoute(
  levelInfo: TrophyLevelInfo,
  candidates: readonly AchievementTile[]
): NextLevelRoute | null {
  if (levelInfo.maxed) return null;

  const xpRemaining = levelInfo.neededForNext - levelInfo.currentXp;
  if (xpRemaining <= 0) return null;

  const steps = candidates
    .filter((tile) => !tile.unlocked && tile.xp > 0)
    .sort((a, b) => {
      // Closest to earned first; unmeasurable badges cannot be "close to" anything.
      const aPct = a.percent ?? -1;
      const bPct = b.percent ?? -1;
      if (aPct !== bPct) return bPct - aPct;
      return b.xp - a.xp;
    })
    .slice(0, 3)
    .map((tile) => ({ id: tile.id, name: tile.name, xp: tile.xp, rarity: tile.rarity }));

  const covered = steps.reduce((sum, step) => sum + step.xp, 0);

  /**
   * Nothing left to earn means there is no route to suggest.
   *
   * Returning an object with an empty `steps` array here would put "Next level in
   * 90 XP. One possible route:" on the page followed by nothing - a sentence with
   * no sentence. The caller has no way to tell that apart from a populated route,
   * so the absence is expressed here.
   */
  if (steps.length === 0) return null;

  return { xpRemaining, steps, shortfall: covered < xpRemaining };
}

// ============================================================================
// Tiered families (AC13)
// ============================================================================

export interface FamilyDefinition {
  id: string;
  label: string;
  description: string;
  /** Member definition ids, in ascending order of difficulty. */
  memberIds: readonly string[];
}

/**
 * Presentation-only groupings. XP, earned state and unlock logic are untouched.
 *
 * The five habit-streak badges are one ladder a user climbs rather than five
 * separate tiles they cannot relate to each other, and the same for the
 * perfect-run badges. Each rung is still its own catalogue entry with its own XP,
 * so the total a ladder represents is identical to the sum of its badges and
 * nothing about earning is rewritten.
 */
export const ACHIEVEMENT_FAMILIES: readonly FamilyDefinition[] = [
  {
    id: 'habit-streak',
    label: 'Habit streak',
    description: 'Keep any habit going, day after day',
    memberIds: [
      'first-habit-streak',
      'habit-streak-7',
      'habit-streak-30',
      'habit-streak-100',
      'habit-streak-365',
    ],
  },
  {
    id: 'perfect-run',
    label: 'Perfect run',
    description: 'Score a perfect day, then keep the run alive',
    memberIds: ['perfect-day', 'perfect-week', 'perfect-month', 'perfect-year'],
  },
];

export interface FamilyStep {
  id: string;
  name: string;
  rarity: AchievementRarity;
  icon: string;
  color: string;
  earned: boolean;
  /** XP for this rung, or `null` when the badge is not in the tiles. */
  xp: number | null;
}

export interface FamilyLadder {
  family: FamilyDefinition;
  steps: FamilyStep[];
  earnedCount: number;
  /** The next unearned rung, or `null` when the ladder is complete. */
  nextStep: FamilyStep | null;
}

/**
 * Fold tiles into ladders.
 *
 * A rung whose badge is absent from `tiles` keeps a `null` xp rather than `0`, so
 * a partially-loaded catalogue cannot make a rung look free.
 */
export function familyLadders(tiles: readonly AchievementTile[]): FamilyLadder[] {
  const byId = new Map(tiles.map((tile) => [tile.id, tile]));
  return ACHIEVEMENT_FAMILIES.map((family) => {
    const steps: FamilyStep[] = family.memberIds.map((id) => {
      const tile = byId.get(id);
      return {
        id,
        name: tile?.name ?? id,
        rarity: tile?.rarity ?? 'COMMON',
        icon: tile?.icon ?? '🏅',
        color: tile?.color ?? '#6b7280',
        earned: tile?.unlocked ?? false,
        xp: tile ? tile.xp : null,
      };
    });
    const earnedCount = steps.filter((step) => step.earned).length;
    return {
      family,
      steps,
      earnedCount,
      nextStep: steps.find((step) => !step.earned) ?? null,
    };
  });
}

/** Definition ids that belong to a family, so the grid can hide them. */
export function familyMemberIds(): Set<string> {
  return new Set(ACHIEVEMENT_FAMILIES.flatMap((family) => [...family.memberIds]));
}