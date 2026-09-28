/**
 * Sleep score presentation helpers.
 *
 * This file used to contain `GET`/`POST` route handlers that imported
 * `next/server` and called `SleepRepository` directly from `src/lib`. That was
 * two problems at once: it put a repository call outside the service layer, and
 * it duplicated `src/app/api/sleep/route.ts`, which is the real route. Nothing
 * imported those handlers, so they were dead code that would drift from the live
 * route. Only the pure band helper below is used, by `SleepCard`.
 *
 * The band colours are semantic Tailwind tokens rather than the fixed
 * `bg-green-100 text-green-800` palette they used to be, which rendered as a
 * pale chip with dark text in both themes. A light-background/text pair cannot
 * adapt to the dark theme; a low-alpha tint plus an explicit dark-mode text
 * colour uses the theme's own foreground.
 */

export interface SleepScoreBand {
  /** Tailwind classes for the band pill: tinted background + readable text. */
  color: string;
  /** Tailwind classes for the meter's filled portion. */
  barColor: string;
  label: string;
  /** What the score means, shown as helper text under the meter. */
  description: string;
}

export function getSleepScoreBand(score: number): SleepScoreBand {
  if (score >= 85) {
    return {
      color: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      barColor: 'bg-emerald-500',
      label: 'Excellent',
      description: 'Long and restorative — keep this up.',
    };
  }
  if (score >= 70) {
    return {
      color: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
      barColor: 'bg-sky-500',
      label: 'Good',
      description: 'Solid night’s sleep.',
    };
  }
  if (score >= 50) {
    return {
      color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
      barColor: 'bg-amber-500',
      label: 'Fair',
      description: 'Shorter than planned — aim for your target window.',
    };
  }
  return {
    color: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
    barColor: 'bg-rose-500',
    label: 'Poor',
    description: 'Well under your target. Worth protecting an earlier bedtime.',
  };
}

/** Human label for the 1–5 self-reported quality rating. */
export function getQualityLabel(quality: number): string {
  if (quality >= 5) return 'Excellent';
  if (quality === 4) return 'Good';
  if (quality === 3) return 'Fair';
  if (quality === 2) return 'Poor';
  return 'Very poor';
}
