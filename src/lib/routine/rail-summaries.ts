/**
 * One-line answers for the folded rail cards.
 *
 * ## Why these exist
 *
 * A disclosure that folds to a bare word makes the reader reopen things to find
 * out whether they care. Each summary states the card's own answer, so the
 * decision to expand can be made without expanding.
 *
 * ## Why they are derived, not stored
 *
 * Every one of these is computed from the same payload the card below it renders.
 * A folded row saying something different from the expanded card would be a third
 * "this week" number on the page, which is the exact problem the completion-rate
 * work removed.
 */

import type { DayTypeRollup } from '@/lib/routine/week-pattern';
import { weekAverage } from '@/lib/routine/week-pattern';
import { partitionOverrides } from '@/lib/routine/day-overrides';
import type { DayOverride } from '@/types/routine';

/** "62% weekly average" / "nothing tracked yet". */
export function weekSummary(response: Parameters<typeof weekAverage>[0]): string | null {
  const average = weekAverage(response);
  if (average === null) return 'nothing tracked yet';
  return `${average}% weekly average`;
}

/** "Workday 78% · Weekend 54%" — best and worst, which is the comparison. */
export function dayTypeSummary(rollups: DayTypeRollup[]): string | null {
  if (rollups.length === 0) return 'no rated days yet';
  const best = rollups[0];
  const worst = rollups[rollups.length - 1];
  if (!best) return 'no rated days yet';
  if (rollups.length === 1) return `${best.dayTypeName} ${best.averageCompletionRate}%`;
  return `${best.dayTypeName} ${best.averageCompletionRate}% · ${worst?.dayTypeName ?? ''} ${worst?.averageCompletionRate ?? 0}%`;
}

/** "3 near today · 12 total". */
export function overridesSummary(
  overrides: DayOverride[] | null,
  today: string
): string | null {
  if (!overrides || overrides.length === 0) return 'none set';
  const { upcoming, recent, totalCount } = partitionOverrides(overrides, today);
  const near = upcoming.length + recent.length;
  if (near === 0) return `${totalCount} total, none near today`;
  return `${near} near today · ${totalCount} total`;
}
