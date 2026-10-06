/**
 * Pace projection for the current, incomplete period.
 *
 * ## What this is allowed to do
 *
 * Project a period that has not finished, and nothing else. Two rules follow from that and
 * both are load-bearing.
 *
 * **Never for a completed period.** A finished month's score is known. Projecting it
 * would replace a measurement with an estimate and present the estimate as the result.
 *
 * **A range, not a point.** Extrapolating from three elapsed days has real spread, and a
 * single number would imply a confidence the data does not have. The output is
 * low–high, and the wording says "projection" every time it appears.
 *
 * ## The method, and why it is that one
 *
 * Current value ÷ elapsed days × total days. Not a trailing-14-day rate: three days of
 * data cannot support a two-week baseline, and blending in a baseline the user cannot see
 * would make the projection depend on data outside the period they are looking at.
 *
 * Anchored on *elapsed* days and clipped to the real total, so a period that is nearly
 * over projects close to what is already measured rather than overshooting.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

/** Below this, a projection is noise. Matches the insight rules' minimum-data discipline. */
export const MIN_DAYS_FOR_PACE = 3;

export interface PaceInput {
  /** The value achieved so far in the period. */
  current: number | null;
  /** Days of the period that have happened. */
  elapsedDays: number;
  /** Days the period contains in total. */
  totalDays: number;
  /** True when the period is the current one and has not finished. */
  isCurrentIncompletePeriod: boolean;
}

export interface PaceProjection {
  /** Projected value at the end of the period. */
  low: number;
  high: number;
  /** Elapsed days ÷ total days, as a percentage. */
  progress: number;
  /** On pace, behind, or not determinable. */
  standing: 'ahead' | 'on-pace' | 'behind' | 'unknown';
}

/**
 * Project the end-of-period value, or `null` when projecting would be dishonest.
 *
 * `null` covers three cases, all of which should read as "no projection" rather than as
 * a zero: too little elapsed, nothing measured yet, or a period that has already ended.
 */
export function projectPace(input: PaceInput): PaceProjection | null {
  if (!input.isCurrentIncompletePeriod) return null;
  if (input.current == null) return null;
  if (input.elapsedDays < MIN_DAYS_FOR_PACE) return null;
  if (input.totalDays <= 0 || input.elapsedDays > input.totalDays) return null;

  const perDay = input.current / input.elapsedDays;
  const midpoint = perDay * input.totalDays;

  /*
    The band is proportional to how little is known: three days of data gets a wide
    range, twenty-eight gets a narrow one. A tenth of the projection either way is
    arbitrary but honest — the alternative is a single number implying a precision that
    three days cannot deliver.
  */
  const spread = Math.abs(midpoint) * 0.1;
  const low = Math.max(0, midpoint - spread);
  const high = Math.min(input.totalDays * 100, midpoint + spread);

  return {
    low: round(low),
    high: round(high),
    progress: Math.round((input.elapsedDays / input.totalDays) * 100),
    standing: standingFor(input.current, input.elapsedDays, input.totalDays),
  };
}

/**
 * Whether the period is running ahead of, level with, or behind a linear pace.
 *
 * Neutral wording throughout. "Behind pace" describes the arithmetic; it does not accuse
 * the user of anything, and nothing here should read as a failure state — a period three
 * days in is *expected* to look behind a linear pace.
 */
function standingFor(
  current: number,
  elapsedDays: number,
  totalDays: number
): PaceProjection['standing'] {
  if (current <= 0) return 'unknown';

  // Where a perfectly linear period would be today.
  const expectedRatio = elapsedDays / totalDays;
  const actualRatio = current / 100;

  const distance = actualRatio - expectedRatio;
  if (distance > 0.05) return 'ahead';
  if (distance < -0.05) return 'behind';
  return 'on-pace';
}

/**
 * The sentence under the projection.
 *
 * Always says "projection", per the microcopy rule, and states how much of the period it
 * is based on — a projection from three days should not be readable as a forecast from a
 * month.
 */
export function paceSentence(
  pace: PaceProjection,
  target: number,
  elapsedDays: number,
  totalDays: number,
  unit: 'percent' | 'minutes'
): string {
  const format = (value: number): string =>
    unit === 'percent' ? `${Math.round(value)}%` : `${Math.round(value)} min`;

  const projected = pace.low === pace.high ? format(pace.low) : `${format(pace.low)}–${format(pace.high)}`;

  return (
    `Projection for the end of this period: ${projected}, based on the first ` +
    `${elapsedDays} of ${totalDays} days. ` +
    (pace.standing === 'behind'
      ? 'Running behind a straight-line pace.'
      : pace.standing === 'ahead'
        ? 'Running ahead of a straight-line pace.'
        : pace.standing === 'on-pace'
          ? 'Close to a straight-line pace.'
          : `Target ${format(target)}.`)
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
