/**
 * The insight engine for the analytics hero: ranked, evidence-backed findings.
 *
 * ## Why this is a pure module over a prepared input
 *
 * Analytics 2.0 decision D3 said "insights are pure functions over already-loaded
 * data". That turned out to be false, and building to it would have wasted the phase:
 * `getDashboard` loads one period plus one comparison, while four of the eight rules
 * need a *trailing* window — best-weekday needs four weeks, sleep drift needs 28 days,
 * anomaly needs a trailing 28-day mean, and a slipping habit needs two comparisons.
 *
 * So the split is: **the service assembles a purpose-built input, these rules stay
 * pure.** The purity is what makes the thresholds testable, and the thresholds are the
 * part that has to be right — a rule that fires on two days of data is worse than no
 * rule, because the user has no way to tell it apart from a real finding.
 *
 * ## The rules all obey
 *
 *  - **Never claim more than the data supports.** Each rule declares a minimum in
 *    `THRESHOLDS` and returns nothing when it is unmet. An empty list is the correct
 *    output for a new account, not a failure.
 *  - **Show the numbers.** `evidence` always carries the figures and the window they
 *    came from, so a finding can be checked rather than trusted.
 *  - **Never present a planned day as a failure.** A rest day or a minimum day scoring
 *    low is the plan working. `flaggedDay` wording reflects that, and such a day can
 *    only ever be the *best* day's excuse, never framed as a problem.
 *  - **No causation.** "tends to", "on days when" — never "because" or "causes".
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

/** Thresholds, named, so the rules below read as claims rather than magic numbers. */
export const THRESHOLDS = {
  /** A habit must have moved at least this many points to be worth mentioning. */
  moverPoints: 5,
  /** Scheduled days needed in *each* period before a mover is credible. */
  moverScheduledDays: 3,
  /** Scored days before naming a best or worst day is meaningful. */
  daysForBestWorst: 3,
  /** A live streak below this is not a streak worth a chip. */
  streakForChip: 3,
  /** Drop in points before a habit counts as slipping rather than wobbling. */
  slippingPoints: 10,
} as const;

export type InsightCategory = 'mover' | 'day' | 'streak' | 'slipping';

export interface AnalyticsInsight {
  /** Stable across renders, so a mute preference can key on it. */
  id: string;
  category: InsightCategory;
  /** The finding, with its number in the sentence. */
  headline: string;
  /** The figures behind it, and the window they came from. */
  evidence: string;
  /** The minimum-data check that had to pass, stated so the claim is auditable. */
  basis: string;
  severity: 'positive' | 'negative' | 'neutral';
  /** Where to go to act on it, when there is somewhere to go. */
  href: string | null;
  hrefLabel: string | null;
}

export interface ScoredDayLike {
  date: string;
  totalScore: number | null;
  isRestDay: boolean;
  isMinimumDay: boolean;
}

export interface HabitRateLike {
  habitId: string;
  name: string;
  /** `null` when the habit was never due in the window. */
  rate: number | null;
  previousRate: number | null;
  scheduled: number;
  previousScheduled: number;
}

export interface InsightInput {
  /** e.g. "October 2026", used in the wording. */
  periodLabel: string;
  comparisonLabel: string | null;
  scores: ScoredDayLike[];
  habitRates: HabitRateLike[];
  streak: {
    current: number;
    /** `null` when no milestone is configured. */
    nextMilestone: number | null;
    /** Days to that milestone, or `null` when there is not one. */
    daysToNextMilestone: number | null;
  };
  heroTotal: number | null;
  comparisonDelta: number | null;
  /** Categories the user has hidden on this device. */
  muted: readonly string[];
}

const PERCENT = (value: number): string => `${Math.round(value)}%`;

/**
 * Ranked findings, best first, capped at three.
 *
 * Capped because a wall of chips is a wall nobody reads, and because the top three are
 * the ones with a defensible claim — anything past that is trivia with a threshold
 * attached.
 */
export function buildInsights(input: InsightInput, limit = 3): AnalyticsInsight[] {
  const muted = new Set(input.muted);
  const candidates: AnalyticsInsight[] = [
    ...moverInsight(input),
    ...dayInsights(input),
    ...streakInsight(input),
    ...slippingInsight(input),
  ];

  return candidates
    .filter((insight) => !muted.has(insight.category))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

/**
 * Ordering.
 *
 * Severity first so a negative finding is never pushed below a neutral one purely
 * because it sorted later alphabetically, then category priority for ties — a mover
 * is a change the user did not ask about but will care about, a streak is context.
 */
function rank(insight: AnalyticsInsight): number {
  const severity = insight.severity === 'negative' ? 0 : insight.severity === 'positive' ? 1 : 2;
  const category = insight.category === 'mover' ? 0 : insight.category === 'day' ? 1 : 2;
  return severity * 10 + category;
}

/**
 * The habit whose completion rate moved most against the comparison.
 *
 * Both periods must have enough *scheduled* days. A rate computed from one scheduled
 * day swings 100 points on a single checkbox, and reporting that as "Meditate is up 60
 * points" would be technically true and completely useless.
 */
function moverInsight(input: InsightInput): AnalyticsInsight[] {
  const eligible = input.habitRates.filter(
    (habit) =>
      habit.scheduled >= THRESHOLDS.moverScheduledDays &&
      habit.previousScheduled >= THRESHOLDS.moverScheduledDays &&
      habit.rate != null &&
      habit.previousRate != null
  );
  if (eligible.length === 0) return [];

  const biggest = eligible.reduce((best, habit) => {
    const delta = (habit.rate ?? 0) - (habit.previousRate ?? 0);
    const bestDelta = (best.rate ?? 0) - (best.previousRate ?? 0);
    return Math.abs(delta) > Math.abs(bestDelta) ? habit : best;
  });

  const delta = Math.round(((biggest.rate ?? 0) - (biggest.previousRate ?? 0)) * 10) / 10;
  if (Math.abs(delta) < THRESHOLDS.moverPoints) return [];

  const up = delta > 0;
  return [
    {
      id: `mover:${biggest.habitId}`,
      category: 'mover',
      headline: up
        ? `${biggest.name} is up ${Math.abs(delta)} points`
        : `${biggest.name} is down ${Math.abs(delta)} points`,
      evidence:
        `${PERCENT(biggest.rate ?? 0)} of ${biggest.scheduled} due, ` +
        `against ${PERCENT(biggest.previousRate ?? 0)} of ${biggest.previousScheduled} ` +
        `in ${input.comparisonLabel ?? 'the previous period'}.`,
      basis: `At least ${THRESHOLDS.moverScheduledDays} scheduled days in each period.`,
      severity: up ? 'positive' : 'negative',
      href: `/habits/${biggest.habitId}`,
      hrefLabel: `Open ${biggest.name}`,
    },
  ];
}

/**
 * Best and worst scored day.
 *
 * A flagged day is never described as a failure. A rest day is *meant* to score low, so
 * when the worst day is one, that is stated as the explanation rather than offered as
 * the bad news — which inverts the reading, because the user did the right thing.
 */
function dayInsights(input: InsightInput): AnalyticsInsight[] {
  const scored = input.scores.filter(
    (day): day is ScoredDayLike & { totalScore: number } => day.totalScore !== null
  );
  if (scored.length < THRESHOLDS.daysForBestWorst) return [];

  const best = scored.reduce((a, b) => (b.totalScore > a.totalScore ? b : a));
  const worst = scored.reduce((a, b) => (b.totalScore < a.totalScore ? b : a));

  const results: AnalyticsInsight[] = [
    {
      id: `day:best:${best.date}`,
      category: 'day',
      headline: `Best day: ${formatDay(best.date)} at ${Math.round(best.totalScore)}`,
      evidence: describeDay(best),
      basis: `At least ${THRESHOLDS.daysForBestWorst} scored days in ${input.periodLabel}.`,
      severity: 'positive',
      href: `/today?date=${best.date}`,
      hrefLabel: 'Open that day',
    },
  ];

  // A single scored day has no worst day distinct from its best.
  if (worst.date !== best.date) {
    results.push({
      id: `day:worst:${worst.date}`,
      category: 'day',
      headline: `Lowest day: ${formatDay(worst.date)} at ${Math.round(worst.totalScore)}`,
      evidence: describeDay(worst),
      basis: `At least ${THRESHOLDS.daysForBestWorst} scored days in ${input.periodLabel}.`,
      severity: 'neutral',
      href: `/today?date=${worst.date}`,
      hrefLabel: 'Open that day',
    });
  }

  return results;
}

/**
 * A live streak worth mentioning, or the milestone it is heading for.
 *
 * Only ever positive framing. A streak at risk is a different insight, and inventing it
 * here would mean claiming the user is going to break something they have not.
 */
function streakInsight(input: InsightInput): AnalyticsInsight[] {
  const { current, nextMilestone, daysToNextMilestone } = input.streak;
  if (current < THRESHOLDS.streakForChip) return [];

  const days = `${current} ${current === 1 ? 'day' : 'days'}`;
  const evidence =
    nextMilestone != null && daysToNextMilestone != null
      ? `${days} in a row. Next milestone at ${nextMilestone} days — ${daysToNextMilestone} to go.`
      : `${days} in a row.`;

  return [
    {
      id: 'streak:current',
      category: 'streak',
      headline: `${days} in a row`,
      evidence,
      basis: `A live streak of at least ${THRESHOLDS.streakForChip} days.`,
      severity: 'positive',
      href: '/today',
      hrefLabel: 'Keep it going',
    },
  ];
}

/**
 * A habit that dropped sharply against the comparison.
 *
 * A stricter threshold than the mover on purpose. "Up 6 points" is worth mentioning
 * because it is encouraging; "down 6 points" is usually noise, and reporting every
 * wobble is how a page like this loses credibility.
 */
function slippingInsight(input: InsightInput): AnalyticsInsight[] {
  if (input.comparisonDelta == null) return [];

  const dropped = input.habitRates
    .filter(
      (habit) =>
        habit.scheduled >= THRESHOLDS.moverScheduledDays &&
        habit.previousScheduled >= THRESHOLDS.moverScheduledDays &&
        habit.rate != null &&
        habit.previousRate != null &&
        (habit.previousRate ?? 0) - (habit.rate ?? 0) >= THRESHOLDS.slippingPoints
    )
    .sort(
      (a, b) => (b.previousRate ?? 0) - (b.rate ?? 0) - ((a.previousRate ?? 0) - (a.rate ?? 0))
    );

  const worst = dropped[0];
  if (!worst) return [];

  const drop = Math.round(((worst.previousRate ?? 0) - (worst.rate ?? 0)) * 10) / 10;
  return [
    {
      id: `slipping:${worst.habitId}`,
      category: 'slipping',
      headline: `${worst.name} has fewer completions`,
      evidence:
        `${PERCENT(worst.rate ?? 0)} of ${worst.scheduled} due, ` +
        `against ${PERCENT(worst.previousRate ?? 0)} of ${worst.previousScheduled} ` +
        `in ${input.comparisonLabel ?? 'the previous period'} — ${drop} points fewer.`,
      basis: `At least ${THRESHOLDS.slippingPoints} points below the comparison, with ${THRESHOLDS.moverScheduledDays} scheduled days in each period.`,
      severity: 'negative',
      href: `/habits/${worst.habitId}`,
      hrefLabel: `Open ${worst.name}`,
    },
  ];
}

/**
 * Describe a day without editorialising about a planned one.
 *
 * The wording is the whole point: "planned rest day, so a lower score is expected" is a
 * different fact from "worst day", and conflating them tells a user who did the right
 * thing that they did badly.
 */
function describeDay(day: ScoredDayLike & { totalScore: number }): string {
  if (day.isRestDay) {
    return `${Math.round(day.totalScore)} out of 100. This was a planned rest day, so a lower score is expected.`;
  }
  if (day.isMinimumDay) {
    return `${Math.round(day.totalScore)} out of 100. This was a reduced-load day, so fewer habits were due.`;
  }
  return `${Math.round(day.totalScore)} out of 100, with a full day of habits due.`;
}

/** `2026-10-04` to `4 Oct`, without pulling a locale-dependent formatter into a rule. */
function formatDay(date: string): string {
  const month = date.slice(5, 7);
  const day = date.slice(8, 10);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const index = Number(month) - 1;
  return `${Number(day)} ${months[index] ?? month}`;
}
