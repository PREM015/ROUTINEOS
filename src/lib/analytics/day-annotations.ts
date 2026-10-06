/**
 * Classification and wording for the period's planned days.
 *
 * ## Why this is a module rather than inline in the component
 *
 * Two reasons, and the second is the important one.
 *
 * The first is that the wording is a **claim about the user's data**, and claims belong
 * where they can be tested. "A lower score on these days is expected rather than a miss"
 * is the sentence that stops a planned rest day reading as a collapse in consistency, and
 * a sentence that important should not be buried in a JSX branch where nobody checks it.
 *
 * The second is that the component needs to answer two questions — *is this day flagged?*
 * and *what do we say about the period?* — and both answers have to agree. Deriving them
 * separately is how a chip says "Rest day" while the sentence says something else.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

import type { AnalyticsDashboard } from '@/types/analytics';

export type DayAnnotation = AnalyticsDashboard['annotations'][string];

/**
 * Whether a day was planned to be lighter than usual.
 *
 * A rest day and a reduced-load day are different in what the user intended and identical
 * in what they mean for a score, so every consumer here treats them as one flag. Only the
 * wording distinguishes them.
 */
export function isRestDayOrMinimum(annotation: DayAnnotation | undefined): boolean {
  return annotation?.isRestDay === true || annotation?.isMinimumDay === true;
}

/**
 * The sentence explaining the period's planned days, or `null` when there are none.
 *
 * `null` rather than "0 rest days" on purpose: an ordinary week would otherwise carry a
 * line reading "0 rest days and 0 reduced-load days", and a component that always says
 * something is a component the reader learns to skip. Silence is the honest rendering of
 * "nothing planned".
 *
 * Always ends with the sentence that does the real work — that a lower score on these days
 * is expected rather than a miss. Without it the chips are a list of dates.
 */
export function summariseAnnotations(annotations: AnalyticsDashboard['annotations']): string | null {
  const entries = Object.values(annotations);
  if (entries.length === 0) return null;

  const restDays = entries.filter((entry) => entry.isRestDay).length;
  const minimumDays = entries.filter((entry) => entry.isMinimumDay).length;

  const counts: string[] = [];
  if (restDays > 0) {
    counts.push(`${restDays} planned rest ${restDays === 1 ? 'day' : 'days'}`);
  }
  if (minimumDays > 0) {
    counts.push(`${minimumDays} reduced-load ${minimumDays === 1 ? 'day' : 'days'}`);
  }

  return `${counts.join(' and ')}. A lower score on these days is expected rather than a miss.`;
}

/** Stable, human-readable label for one flagged day. */
export function annotationLabel(annotation: DayAnnotation): string {
  if (annotation.isRestDay) return 'Rest day';
  return 'Reduced load';
}
