/**
 * Pure achievement criteria checkers.
 *
 * Given a precomputed world-state snapshot, these functions decide whether each
 * achievement definition's criteria are currently met. This module has no DB
 * access and no side effects; callers gather the state and pass it in.
 *
 * State shape: `{ totals, streaks, dates, counts }`.
 * - `totals`  – scalar aggregates (e.g. `goalsCompleted`, `totalHabitLogs`).
 * - `streaks` – per-habit streak lengths (`{ [habitId]: days }`).
 * - `dates`   – date buckets keyed by semantic name (e.g. `activeDates`).
 * - `counts`  – generic counters for fields not modelled in `totals`.
 */

import { calculateLongestStreak } from '@/server/domain/streak/streak-calculator';
import type {
  AchievementCriteria,
  AchievementDefinitionConfig,
} from '@/lib/constants/achievements';
import { allDefinitions } from './definitions';

/**
 * Aggregated snapshot of a user's activity used to evaluate achievement
 * criteria. Every field is optional; missing values are treated as not met.
 */
export interface AchievementWorldState {
  totals: {
    /** Longest/current habit streak in days ("streak" criterion). */
    streak?: number;
    /** Number of goals ever completed. */
    goalsCompleted?: number;
    /** Score of the most recent scored day (0-100). */
    dailyScore?: number;
    /** Number of early (< 6 AM) wake-ups, all-time. */
    earlyWakeups?: number;
    /** Number of productive late-evening sessions, all-time. */
    lateEvenings?: number;
    /** Total focused hours across all sessions. */
    focusHours?: number;
    /** Total focused minutes across all sessions. */
    focusMinutes?: number;
    /** Number of wellness check-ins logged. */
    wellnessLogs?: number;
    /** Number of focus sessions completed. */
    focusSessions?: number;
    /** Number of days scoring >= 95. */
    perfectDays?: number;
    /** Number of weeks with 7 consecutive perfect days. */
    perfectWeeks?: number;
    /** Total habit completions logged. */
    totalHabitLogs?: number;
    /** Number of active tracking days. */
    daysActive?: number;
    /** Number of journal entries written. */
    journalEntries?: number;
  };
  /** Per-habit streak lengths keyed by habit id. */
  streaks: Record<string, number>;
  /** Date buckets keyed by semantic name (e.g. `activeDates`, `scoredDays`). */
  dates: Record<string, readonly string[]>;
  /** Generic counters for fields not modelled above. */
  counts: Record<string, number>;
}

type WorldStateTotals = AchievementWorldState['totals'];

/** All fields a criterion may reference, in order of resolution. */
const TOTAL_FIELDS: readonly (keyof WorldStateTotals)[] = [
  'streak',
  'goalsCompleted',
  'dailyScore',
  'earlyWakeups',
  'lateEvenings',
  'focusHours',
  'focusMinutes',
  'wellnessLogs',
  'focusSessions',
  'perfectDays',
  'perfectWeeks',
  'totalHabitLogs',
  'daysActive',
  'journalEntries',
];

/**
 * Resolve the current numeric value for a criterion field.
 *
 * Resolution order: `totals` → `counts` → derived (`streak` computed from
 * streak values or the `activeDates` bucket). Returns `undefined` when no
 * value can be found, which the checker treats as "criterion not met".
 */
export function resolveCriterionValue(
  field: string,
  state: AchievementWorldState
): number | undefined {
  const totalKey = field as keyof WorldStateTotals;
  if (TOTAL_FIELDS.includes(totalKey)) {
    const total = state.totals[totalKey];
    if (typeof total === 'number') return total;
  }

  const counted = state.counts[field];
  if (typeof counted === 'number') return counted;

  if (field === 'streak') {
    return resolveStreakValue(state);
  }

  return undefined;
}

/**
 * Best available streak length: explicit `totals.streak`, else the longest
 * per-habit streak, else the longest run derived from `dates.activeDates`.
 */
function resolveStreakValue(state: AchievementWorldState): number | undefined {
  const explicit = state.totals.streak;
  if (explicit !== undefined) return explicit;

  let longest = 0;
  for (const value of Object.values(state.streaks)) {
    if (value > longest) longest = value;
  }
  if (longest > 0) return longest;

  const activeDates = state.dates['activeDates'];
  if (activeDates && activeDates.length > 0) {
    return calculateLongestStreak([...activeDates]);
  }

  return undefined;
}

function compareOperator(
  value: number,
  operator: AchievementCriteria['operator'],
  target: number
): boolean {
  switch (operator) {
    case '>=':
      return value >= target;
    case '<=':
      return value <= target;
    case '==':
      return value === target;
    case '>':
      return value > target;
  }
}

/**
 * Evaluate a list of criteria against a state snapshot. All criteria must be
 * satisfied and at least one criterion must exist.
 */
export function checkCriteria(
  criteria: readonly AchievementCriteria[],
  state: AchievementWorldState
): boolean {
  if (criteria.length === 0) return false;

  return criteria.every((criterion) => {
    const current = resolveCriterionValue(criterion.field, state);
    if (current === undefined) return false;
    return compareOperator(current, criterion.operator, criterion.value);
  });
}

/**
 * Evaluate a single achievement definition against a state snapshot.
 */
export function checkDefinition(
  def: AchievementDefinitionConfig,
  state: AchievementWorldState
): boolean {
  return checkCriteria(def.criteria, state);
}

/**
 * Result of evaluating one definition against a snapshot.
 */
export interface AchievementSnapshot {
  definition: AchievementDefinitionConfig;
  unlocked: boolean;
}

/**
 * Evaluate every (or a provided subset of) achievement definitions against a
 * snapshot.
 *
 * The `_userId` parameter is reserved for future per-user/snapshot resolution;
 * the checker itself is stateless and only consumes `worldState`.
 *
 * @example
 * checkSnapshots(user.id, {
 *   totals: { goalsCompleted: 12 },
 *   streaks: {},
 *   dates: {},
 *   counts: {},
 * }).filter(s => s.unlocked).map(s => s.definition.name)
 */
export function checkSnapshots(
  _userId: string,
  worldState: AchievementWorldState,
  definitions: readonly AchievementDefinitionConfig[] = allDefinitions
): AchievementSnapshot[] {
  return definitions.map((definition) => ({
    definition,
    unlocked: checkDefinition(definition, worldState),
  }));
}