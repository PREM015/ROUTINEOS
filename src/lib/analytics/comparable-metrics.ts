/**
 * Which metrics may be compared across two periods, and why.
 *
 * ## The rule
 *
 * A **rate or average** can be compared between a part-lived period and a whole one.
 * A **cumulative total** cannot, and comparing one is not a small inaccuracy — it is a
 * guaranteed wrong answer that always favours the longer period.
 *
 * "3 focus sessions this week so far" against "9 last week" reads as a two-thirds decline.
 * The user did the same work at the same rate; the week simply has three days left in it.
 * Every rule below exists to stop a number like that being presented as a change.
 *
 * ## Why this is server-adjacent shared logic and not component state
 *
 * The classification is a **data** judgement, not a display one. Putting it in a
 * component would mean the client re-deriving which figures are cumulative from its own
 * reading of the payload, and two surfaces would eventually disagree about whether focus
 * minutes are comparable. So it lives here, next to `comparison.ts`, and is unit-tested
 * without a DOM.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

/**
 * How a figure behaves when one of the two periods is incomplete.
 *
 * - `rate` — a proportion or per-day average. Comparable.
 * - `cumulative` — a total over the period. **Not** comparable when the spans differ.
 * - `all-time` — not scoped to a period at all, so "versus another period" is meaningless.
 * - `point` — a single value with no time dimension (a setting, a target).
 */
export type MetricKind = 'rate' | 'cumulative' | 'all-time' | 'point';

export interface ComparableMetric {
  /** Stable id used in the UI and in saved views. */
  id: string;
  label: string;
  kind: MetricKind;
  /**
   * Where the number lives in the payload.
   *
   * A dotted path rather than a getter, so the payload shape is data a test can assert
   * against and a reader can check by eye.
   */
  path: string;
  /** Appended when rendering. */
  unit?: 'percent' | 'minutes' | 'count' | 'score' | 'per5';
}

export const COMPARABLE_METRICS: ComparableMetric[] = [
  { id: 'score', label: 'Average score', kind: 'rate', path: 'hero.total', unit: 'score' },
  { id: 'habitRate', label: 'Habit reliability', kind: 'rate', path: 'hero.habitReliability', unit: 'percent' },
  { id: 'core', label: 'Core', kind: 'rate', path: 'hero.core', unit: 'score' },
  { id: 'growth', label: 'Growth', kind: 'rate', path: 'hero.growth', unit: 'score' },
  { id: 'bonus', label: 'Bonus', kind: 'rate', path: 'hero.bonus', unit: 'score' },
  { id: 'sleep', label: 'Sleep per night', kind: 'rate', path: 'tiles.sleepMinutes', unit: 'minutes' },
  { id: 'mood', label: 'Mood', kind: 'rate', path: 'tiles.mood', unit: 'per5' },
  { id: 'routineRate', label: 'Routine completion', kind: 'rate', path: 'tiles.routine.completionRate', unit: 'percent' },
  /*
    Cumulative, and the reason this module exists. Focus minutes over three elapsed days
    against focus minutes over seven is not a decline, it is a shorter week — and it is
    the single most tempting figure on the page to show a delta for.
  */
  { id: 'focusMinutes', label: 'Focus minutes', kind: 'cumulative', path: 'focus.period.minutes', unit: 'minutes' },
  { id: 'focusSessions', label: 'Focus sessions', kind: 'cumulative', path: 'focus.period.sessions', unit: 'count' },
  { id: 'journalEntries', label: 'Journal entries', kind: 'cumulative', path: 'journal', unit: 'count' },
  { id: 'milestones', label: 'Milestones', kind: 'cumulative', path: 'milestones', unit: 'count' },
  { id: 'nutritionEntries', label: 'Nutrition entries', kind: 'cumulative', path: 'nutrition.entries', unit: 'count' },
  /*
    All-time. `getDashboard` loads open tasks and active projects with no date bound at
    all, so these are identical on every tab. Presenting them as "this period versus last
    period" would imply a comparison that does not exist.
  */
  { id: 'streak', label: 'Current streak', kind: 'all-time', path: 'streaks.current', unit: 'count' },
  { id: 'openTasks', label: 'Open tasks', kind: 'all-time', path: 'tasks.open', unit: 'count' },
  { id: 'activeProjects', label: 'Active projects', kind: 'all-time', path: 'projects', unit: 'count' },
];

export interface ComparisonSpan {
  /** Elapsed days in the primary period. */
  primaryDays: number;
  /** Elapsed days in the period being compared against. */
  otherDays: number;
}

export interface MetricVerdict {
  metric: ComparableMetric;
  /**
   * Whether a delta may be shown at all.
   *
   * `false` for a cumulative figure across unequal spans, and for an all-time figure
   * regardless of spans — those are the two cases where a number would be wrong rather
   * than merely noisy.
   */
  comparable: boolean;
  /** Why not, in words. Empty when `comparable`. */
  reason: string;
}

/**
 * Decide, per metric, whether a delta is honest here.
 *
 * `spansEqual` short-circuits the cumulative case: comparing two *complete* periods of
 * equal length is legitimate for totals, which is why this is not simply
 * "never compare cumulative". It is never a whole month against three days.
 */
export function classifyComparableMetrics(
  span: ComparisonSpan,
  periodWord: string
): MetricVerdict[] {
  const spansEqual = span.primaryDays > 0 && span.primaryDays === span.otherDays;

  return COMPARABLE_METRICS.map((metric) => {
    if (metric.kind === 'rate') {
      return { metric, comparable: true, reason: '' };
    }

    if (metric.kind === 'all-time') {
      return {
        metric,
        comparable: false,
        reason: 'This is an all-time figure, so it is the same in any period.',
      };
    }

    if (metric.kind === 'point') {
      return {
        metric,
        comparable: false,
        reason: 'This is a setting rather than a period measurement.',
      };
    }

    if (spansEqual) {
      return { metric, comparable: true, reason: '' };
    }

    return {
      metric,
      comparable: false,
      reason:
        `A total over ${span.primaryDays} ${span.primaryDays === 1 ? 'day' : 'days'} ` +
        `cannot be compared with a total over ${span.otherDays} ` +
        `${span.otherDays === 1 ? 'day' : 'days'} — the shorter ${periodWord} would ` +
        'always look worse. Compare the rate instead.',
    };
  });
}

/** The metrics whose deltas may be shown, in display order. */
export function comparableOnly(verdicts: MetricVerdict[]): MetricVerdict[] {
  return verdicts.filter((verdict) => verdict.comparable);
}

/** The metrics that are suppressed, with the reason each one gives. */
export function suppressed(verdicts: MetricVerdict[]): MetricVerdict[] {
  return verdicts.filter((verdict) => !verdict.comparable);
}

/**
 * The sentence describing what this comparison actually did.
 *
 * Always present, including when everything is suppressed — the same reasoning as
 * `buildComparisonWindow.basis`: "nothing to compare" has to be a statement, not an
 * absence, or the panel reads as broken rather than as deliberately limited.
 */
export function comparisonBasis(
  primaryLabel: string,
  primaryDays: number,
  otherLabel: string,
  otherDays: number,
  suppressedCount: number
): string {
  if (primaryDays === 0) {
    return 'This period has not started yet, so there is nothing to compare.';
  }

  const spans =
    primaryDays === otherDays
      ? `Both cover ${primaryDays} ${primaryDays === 1 ? 'day' : 'days'}.`
      : `${primaryLabel} covers ${primaryDays} ${primaryDays === 1 ? 'day' : 'days'}, ` +
        `${otherLabel} covers ${otherDays} ${otherDays === 1 ? 'day' : 'days'}.`;

  if (suppressedCount === 0) return spans;

  return (
    `${spans} Rates and averages only — ` +
    `${suppressedCount} cumulative or all-time ${suppressedCount === 1 ? 'figure is' : 'figures are'} ` +
    'not compared, because the shorter period would always look worse.'
  );
}
