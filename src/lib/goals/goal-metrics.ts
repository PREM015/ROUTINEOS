/**
 * Goal pace — the one calculation the whole `/goals` page is built on.
 *
 * ## The single metaphor
 *
 * A goal is a comparison of two shares:
 *
 * - **elapsed share** — how much of the goal's own calendar window has passed
 * - **progress share** — how much of the target has been reached
 *
 * Their difference *is* pace. There is no separate "on track" flag, no scoring
 * weight, no tier: one subtraction, and everything on the page — the Pace
 * Track's gap wedge, the row tint, the Horizon bar's overhang, the projected
 * finish date — is a different projection of that same number. If an element on
 * the page cannot be traced back to these two shares, it is decoration.
 *
 * ## Why this file is pure and import-free
 *
 * It imports **nothing** — not `@/lib/dates`, not Prisma, not React. That is a
 * hard constraint, not a preference:
 *
 * - `'use client'` files import it, so any value import from `@/lib/prisma`
 *   would pull the Node Prisma client (679 KB, Node built-ins) into the browser
 *   bundle. That has already happened twice in this repo.
 * - `tests/lib/*.test.ts` files import it, and a test may not transitively reach
 *   `@/lib/prisma` because that module throws at import time without
 *   `DATABASE_URL`.
 *
 * Dates arrive as `YYYY-MM-DD` **calendar labels** and all arithmetic is done on
 * those labels. A calendar day has no timezone; `new Date('2026-10-01')` is UTC
 * midnight and `.getDate()` then reads the *host's* day, which is how a
 * Pacific-time user ends up reviewing yesterday. See `src/lib/dates.ts` for the
 * same argument at length.
 *
 * ## Priority is not pace
 *
 * `GoalPriority` never appears in this module. It is orthogonal: colour on this
 * page encodes pace and nothing else, and priority is rendered as a text label.
 * That also dissolves the CRITICAL/HIGH collision the old badge map had, where
 * two distinct priorities shared one colour.
 */

/** Progress share beyond which a goal is treated as reached, not merely close. */
const DONE_EPSILON = 1 - 1e-9;

/** Pace band half-width, in share points (0..1). `±0.05` is the spec's "±5 pts". */
export const PACE_BAND = 0.05;

/** Velocity look-back window. Long enough to survive a missed weekend. */
export const VELOCITY_WINDOW_DAYS = 14;

/** Consistency heat-strip length. */
export const HEAT_STRIP_DAYS = 30;

/** A pace band. `PACED_*` values all carry elapsed-vs-progress meaning. */
export type PaceState =
  /** progress share is >5pts past elapsed share. */
  | 'ahead'
  /** within ±5pts of elapsed share. */
  | 'on_pace'
  /** progress share is >5pts short of elapsed share. */
  | 'behind'
  /** window has closed and the target has not been reached. */
  | 'overdue'
  /** target reached. */
  | 'done'
  /** `ON_HOLD` / `CANCELLED` — the clock is not running. */
  | 'inactive';

/**
 * Client-safe mirror of `GoalStatus` (`prisma/schema.prisma`).
 *
 * Imported from the generated Prisma client **as a value** this would drag the
 * Node client into the browser bundle, so statuses are compared as string
 * literals. `tests/lib/enums.test.ts` keeps this in sync with the schema.
 */
export const GOAL_STATUS = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  MISSED: 'MISSED',
  CARRIED_OVER: 'CARRIED_OVER',
  ON_HOLD: 'ON_HOLD',
  CANCELLED: 'CANCELLED',
} as const;

export type GoalStatusValue = (typeof GOAL_STATUS)[keyof typeof GOAL_STATUS];

/**
 * Statuses where the goal is off the clock and must not be shown as late.
 *
 * `CARRIED_OVER` is deliberately NOT here.
 *
 * It used to be, and that made `/goals` and `/dashboard` contradict each other on
 * the same goal: the dashboard's `goalPace` counts `CARRIED_OVER` as active
 * ("3 of 4 goals on pace") while `/goals` rendered the same goal as `inactive`.
 *
 * The semantic error was calling a carried-over goal parked. Carrying a goal over
 * means it missed its end date and was given a NEW one — the clock is running
 * harder on it than on anything else, and the whole point of the status is that it
 * is still being pursued. Calling that "the clock is not running" is what stops
 * the app ever telling the user they are behind on something they missed.
 *
 * `ON_HOLD` and `CANCELLED` genuinely are parked: the user chose to stop, so
 * reporting them as overdue would punish a decision.
 */
const INACTIVE_STATUSES: ReadonlySet<string> = new Set<string>([
  GOAL_STATUS.COMPLETED,
  GOAL_STATUS.CANCELLED,
  GOAL_STATUS.ON_HOLD,
]);

/** The minimal goal shape the metrics need. Structural, so any caller fits. */
export interface GoalLike {
  startDate: string;
  endDate: string;
  currentValue: number;
  targetValue: number;
  status: string;
}

/** One `GoalProgress` row, reduced to what velocity and the strip consume. */
export interface ProgressPoint {
  /** `YYYY-MM-DD` calendar label of the log's `date`. */
  date: string;
  /**
   * `GoalProgress.value`. A **delta** for goals logged through
   * `POST /api/goals/[id]/progress`; an absolute `1`/`0` for DAILY goals
   * checked in through `/checkin`. {@link cumulativeProgress} normalises the two
   * so a velocity is a rate either way.
   */
  value: number;
  note?: string | null;
}

export interface GoalPace {
  state: PaceState;
  /** 0..1. How much of the target is reached. `0` when there is no target. */
  progressShare: number;
  /** 0..1. How much of the calendar window has passed. `0` before the start. */
  elapsedShare: number;
  /** `progressShare - elapsedShare`, in points. The single source of pace. */
  gapPoints: number;
  /** Whole days in the window; never below 1, so shares cannot divide by zero. */
  daysTotal: number;
  /** Whole days from `startDate` to today, clamped into `[0, daysTotal]`. */
  daysElapsed: number;
  /** Days left in the window. `0` once the window has closed. */
  daysRemaining: number;
  /** Days until the window opens. `0` once it has opened. */
  startsInDays: number;
  /** Signed day count: positive = early, negative = late. */
  scheduleSlackDays: number;
  /**
   * Rate per day implied by the observed window, or `null` when there is not
   * enough signal to say anything (fewer than two distinct logged days).
   */
  velocityPerDay: number | null;
  /** Calendar label the observed rate reaches the target on. */
  projectedFinish: string | null;
  /** Whole days `projectedFinish` misses `endDate` by. `0` on time or unknown. */
  projectedLateByDays: number;
  /** `true` when the goal has no usable `targetValue`. */
  hasNoTarget: boolean;
  /** `true` when `endDate` has passed and the target has not been reached. */
  isOverdue: boolean;
  /** `true` when today is before `startDate`. */
  isNotStarted: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Whole days between two calendar labels. Signed. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

/** Step a `YYYY-MM-DD` label by whole days, staying in UTC. */
export function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return date;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Clamp a share into 0..1, mapping non-finite input to 0. */
function clampShare(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

/**
 * The pace band for a signed gap, in share points.
 *
 * Exported so the drawer, the row and the tests all ask this one question the
 * same way. An exact tie is `on_pace`; the ±5pt band is inclusive of its edge.
 */
export function paceBandFor(gapPoints: number): PaceState {
  if (gapPoints > PACE_BAND) return 'ahead';
  if (gapPoints < -PACE_BAND) return 'behind';
  return 'on_pace';
}

/**
 * Collapse progress rows to **one net value per calendar day**.
 *
 * `GoalProgress.value` means two different things depending on how it was
 * written:
 *
 * - `POST /api/goals/[id]/progress` logs the **delta** the user typed.
 * - `POST /api/goals/[id]/checkin` logs an **absolute** `1` (done) or `0`
 *   (cleared) for a DAILY goal, and `GoalProgress` has no `@@unique([goalId,
 *   date])`, so several rows can land on the same day.
 *
 * Reading rows one at a time therefore gives different answers depending on how
 * many times a goal was touched in a day. Netting by day fixes both cases with
 * one rule: a day is `done` when its rows sum positive, so a `1` followed by the
 * `0` that an undo-check-in writes cancels out instead of leaving a phantom
 * completion behind.
 *
 * Returned ascending by date so callers can walk forward once.
 */
export function netProgressByDay(
  points: readonly ProgressPoint[]
): ProgressPoint[] {
  const net = new Map<string, number>();

  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    net.set(point.date, (net.get(point.date) ?? 0) + point.value);
  }

  return [...net.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

/**
 * Rate per day, from the observed log window.
 *
 * Returns `null` — not `0` — when the rate is unknowable: no rows, or fewer than
 * two distinct logged days, so there is no measured *movement* to divide. `0`
 * and "no signal" are different answers, and a projected finish date built on a
 * fabricated rate is worse than no projection at all.
 *
 * Inside the window the rate is `moved / span`, where `span` runs from the
 * window's first logged day to today — so a goal logged on 3 of the last 14 days
 * is not quietly slowed to a third of its real rate by the days it was silent.
 */
export function observedVelocityPerDay(
  goal: Pick<GoalLike, 'currentValue' | 'startDate'>,
  points: readonly ProgressPoint[],
  today: string,
  windowDays: number = VELOCITY_WINDOW_DAYS
): number | null {
  const perDay = netProgressByDay(points);
  if (new Set(perDay.map((p) => p.date)).size < 2) return null;

  const windowStart = addDays(today, -windowDays + 1);
  const inWindow = perDay.filter((p) => p.date >= windowStart && p.date <= today);

  if (inWindow.length === 0) {
    // Nothing logged this window, but there may be real history before it. Fall
    // back to the lifetime rate over the goal's own window rather than `null`,
    // because the projection is still the best available signal.
    const elapsed = Math.max(1, daysBetween(goal.startDate, today));
    const lifetime = goal.currentValue / elapsed;
    return lifetime > 0 ? lifetime : null;
  }

  const moved = inWindow.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (moved <= 0) return null;

  const span = Math.max(1, daysBetween(inWindow[0]!.date, today));
  return moved / span;
}

/**
 * Full pace derivation for one goal.
 *
 * `today` is a `YYYY-MM-DD` calendar label in the user's own timezone — the
 * caller gets it from `useUserTimezone()`. Passing a host-local date here is how
 * the page used to disagree with the server about which day it was.
 */
export function computeGoalPace(
  goal: GoalLike,
  today: string,
  points: readonly ProgressPoint[] = []
): GoalPace {
  const hasNoTarget = !Number.isFinite(goal.targetValue) || goal.targetValue <= 0;
  const current = Number.isFinite(goal.currentValue) ? goal.currentValue : 0;

  const progressShare = hasNoTarget ? 0 : clampShare(current / goal.targetValue);

  const rawTotal = daysBetween(goal.startDate, goal.endDate);
  const daysTotal = Math.max(1, rawTotal);
  const daysElapsed = clamp(daysBetween(goal.startDate, today), 0, daysTotal);
  const elapsedShare = clamp(daysElapsed / daysTotal, 0, 1);

const gapPoints = progressShare - elapsedShare;
const isNotStarted = daysBetween(today, goal.startDate) > 0;
  // Negative when today is *after* the end date, i.e. the window has closed.
  // `daysBetween` is signed: today-to-end is positive while the goal is still
  // running, so the closed case is the one where it is below zero.
  const windowClosed = daysBetween(today, goal.endDate) < 0;
const reachedTarget = progressShare >= DONE_EPSILON;

  const inactive = INACTIVE_STATUSES.has(goal.status);

  let state: PaceState;
  if (goal.status === GOAL_STATUS.COMPLETED || reachedTarget) {
    // `COMPLETED` outranks the target check: a goal finished by raising its
    // target after the fact has 0% progress and is still done. Conversely a
    // target reached on an ACTIVE goal is done, because the alternative is a
    // full bar reading "behind".
    state = 'done';
  } else if (inactive) {
    // ON_HOLD / CANCELLED: the clock is stopped, so reporting these as overdue
    // would punish a goal the user deliberately parked. `CARRIED_OVER` is not in
    // this branch - it has a new end date and a running clock, so it is paced
    // like any other goal the user is still pursuing.
    state = 'inactive';
  } else if (windowClosed) {
    state = 'overdue';
  } else {
    state = paceBandFor(gapPoints);
  }

  const velocityPerDay = observedVelocityPerDay(goal, points, today);
  const remainingValue = hasNoTarget ? 0 : Math.max(0, goal.targetValue - current);

  let projectedFinish: string | null = null;
  if (
    !hasNoTarget &&
    remainingValue === 0 &&
    velocityPerDay !== null
  ) {
    projectedFinish = today;
  } else if (!hasNoTarget && velocityPerDay !== null && velocityPerDay > 0) {
    projectedFinish = addDays(today, Math.ceil(remainingValue / velocityPerDay));
  }

  const projectedLateByDays =
    projectedFinish !== null ? Math.max(0, daysBetween(goal.endDate, projectedFinish)) : 0;

  /**
   * Schedule slack, in days: how much earlier (positive) or later (negative)
   * the goal would finish if the remaining work were spread evenly over the
   * days that are left. This is the honest, window-relative version of "ahead
   * by 3 days" — a goal 40% done on day 4 of 10 and a goal 40% done on day 40
   * of 100 are the same *share*, and only the second has slack.
   */
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);
  const scheduleSlackDays =
    daysRemaining > 0
      ? Math.round((progressShare - elapsedShare) * daysRemaining)
      : 0;

  return {
    state,
    progressShare,
    elapsedShare,
    gapPoints,
    daysTotal,
    daysElapsed,
    daysRemaining,
    startsInDays: Math.max(0, daysBetween(today, goal.startDate)),
    scheduleSlackDays,
    velocityPerDay,
    projectedFinish,
    projectedLateByDays,
    hasNoTarget,
    isOverdue: state === 'overdue',
    isNotStarted,
  };
}

/** Per-day outcome for the consistency heat-strip. */
export type DayState =
  /** A `GoalProgress` row exists for this day and nets positive. */
  | 'done'
  /** The goal applied on this day and was not done. */
  | 'missed'
  /** The goal did not apply on this day (outside its window). */
  | 'not_applicable'
  /** Today, not yet done. Not a failure — the day is not over. */
  | 'pending';

export interface ConsistencyDay {
  date: string;
  state: DayState;
}

export interface ConsistencySummary {
  days: ConsistencyDay[];
  /** Consecutive applicable days ending today (or yesterday, see below) that were done. */
  streak: number;
  /** Longest run anywhere in the window. */
  longestStreak: number;
  /** Days in the window where the goal applied. */
  applicableDays: number;
  /** Days in the window where it was done. */
  doneDays: number;
  /** Days in the window where it applied and was not done. */
  missedDays: number;
  /**
   * `doneDays / applicableDays`, or `null` when the goal applied on no days.
   *
   * `null` is not `0`. "Never applicable" and "applicable every day, never
   * done" are different facts and the strip renders them differently.
   */
  completionRate: number | null;
}

/**
 * Derive the heat-strip cells and streaks for one goal.
 *
 * ## The rule that matters: a day with no log row is unknown, not failed
 *
 * `GoalProgress` records what was *done*. There is no row for "opened the app
 * and did not do it" and no row for "never opened the app", because the schema
 * cannot tell those apart. So outside the goal's own `[startDate, endDate]`
 * window a day is `not_applicable`, and today is `pending` until the day is
 * actually over — neither is allowed to render as a red cell.
 *
 * A streak survives an unfinished today: it counts back from yesterday while
 * today is still open. Otherwise every goal would show a broken streak for the
 * whole morning, which is a fact about the clock, not about the user.
 */
export function buildConsistency(
  goal: GoalLike,
  points: readonly ProgressPoint[],
  today: string,
  windowDays: number = HEAT_STRIP_DAYS
): ConsistencySummary {
  const net = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    net.set(point.date, (net.get(point.date) ?? 0) + point.value);
  }

  const days: ConsistencyDay[] = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    const withinWindow = date >= goal.startDate && date <= goal.endDate;
    const value = net.get(date) ?? 0;

    let state: DayState;
    if (!withinWindow) state = 'not_applicable';
    else if (value > 0) state = 'done';
    else if (date === today) state = 'pending';
    else state = 'missed';

    days.push({ date, state });
  }

  let streak = 0;
  // Skip an unfinished today rather than reporting a streak of 0 at 09:00.
  const ordered = [...days].reverse();
  if (ordered[0]?.state === 'pending') ordered.shift();
  for (const day of ordered) {
    if (day.state === 'done') streak += 1;
    else if (day.state === 'pending') continue;
    else break;
  }

  let longestStreak = 0;
  let running = 0;
  for (const day of days) {
    if (day.state === 'done') {
      running += 1;
      if (running > longestStreak) longestStreak = running;
    } else if (day.state === 'pending') {
      // Keep the run alive across the still-open day without extending it.
      continue;
    } else {
      running = 0;
    }
  }

  const applicableDays = days.filter((d) => d.state !== 'not_applicable').length;
  const doneDays = days.filter((d) => d.state === 'done').length;
  const missedDays = days.filter((d) => d.state === 'missed').length;

  return {
    days,
    streak,
    longestStreak,
    applicableDays,
    doneDays,
    missedDays,
    completionRate: applicableDays > 0 ? doneDays / applicableDays : null,
  };
}

/**
 * Sparkline points: cumulative progress share against the goal's own window.
 *
 * `null` is a real value here — it means "no log row exists at or before this
 * day", so there is no baseline to draw. Every day *after* the first logged day
 * reports the running total, so the curve is continuous and a goal's progress
 * reads as a curve rather than a row of disconnected spikes.
 */
export function buildSparkline(
  points: readonly ProgressPoint[],
  goal: GoalLike,
  today: string,
  windowDays: number = HEAT_STRIP_DAYS
): Array<{ date: string; value: number | null }> {
  const net = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    net.set(point.date, (net.get(point.date) ?? 0) + point.value);
  }

  const ordered = [...points]
    .filter((p) => p.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const hasTarget = goal.targetValue > 0;
  const out: Array<{ date: string; value: number | null }> = [];
  let running = 0;
  let cursor = 0;
  // Whether any log row has been reached at all. Distinct from `running`: the
  // first logged day sets the baseline, and every later day reports that
  // baseline even when it has no row of its own.
  let hasBaseline = false;

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addDays(today, -i);

    while (cursor < ordered.length && ordered[cursor]!.date <= date) {
      running += Math.max(0, net.get(ordered[cursor]!.date) ?? 0);
      hasBaseline = true;
      cursor += 1;
    }

    out.push({
      date,
      // `null` means "no baseline yet" — a gap the chart must break the line
      // over. Once a baseline exists, a silent day reports the running total
      // rather than null, so a fresh goal does not render as a flat collapse to
      // nothing and a quiet week does not punch holes in the curve.
      value: !hasBaseline
        ? null
        : hasTarget
          ? clampShare(running / goal.targetValue)
          : 0,
    });
  }

  return out;
}

/** Short human label for a pace state. Never colour-only. */
export function paceLabel(state: PaceState): string {
  switch (state) {
    case 'ahead':
      return 'Ahead';
    case 'on_pace':
      return 'On pace';
    case 'behind':
      return 'Behind';
    case 'overdue':
      return 'Overdue';
    case 'done':
      return 'Done';
    case 'inactive':
      return 'Paused';
  }
}

/**
 * One-line explanation of a pace state, in days, for tooltips and the drawer.
 *
 * Returns `null` where a day count would be a fabrication: an unstarted goal has
 * no pace to report, and a goal with no observable velocity has no honest day
 * figure to quote.
 */
export function paceSummary(pace: GoalPace): string | null {
  if (pace.state === 'done') return 'Target reached';
  if (pace.state === 'inactive') return 'Paused — the clock is not running';
  if (pace.hasNoTarget) return 'No target set';
  if (pace.isNotStarted) return `Starts in ${pace.startsInDays} days`;
  if (pace.isOverdue) {
    return pace.projectedFinish
      ? `Overdue — projected ${pace.projectedFinish}`
      : 'Overdue';
  }

  const slack = pace.scheduleSlackDays;
  if (slack === 0) return 'On pace';
  const magnitude = Math.abs(slack);
  const unit = magnitude === 1 ? 'day' : 'days';
  return slack > 0 ? `${magnitude} ${unit} ahead` : `${magnitude} ${unit} behind`;
}

/**
 * Deadline micro-cap: `DUE TODAY` / `DUE IN 12 DAYS` / `12 DAYS OVERDUE`.
 *
 * Takes the goal's own `endDate` rather than deriving it from the pace, because
 * `GoalPace.daysTotal` is a clamped, normalised count — reconstructing the date
 * from it would drift by a day exactly when a day is what is being reported.
 */
export function dueLabel(
  goal: Pick<GoalLike, 'endDate'>,
  pace: GoalPace,
  today: string
): string {
  if (pace.state === 'done') return 'COMPLETED';
  if (pace.state === 'inactive') return 'PAUSED';
  if (pace.hasNoTarget) return 'NO TARGET';

  const days = daysBetween(today, goal.endDate);
  if (days < 0) {
    const over = Math.abs(days);
    return over === 1 ? '1 DAY OVERDUE' : `${over} DAYS OVERDUE`;
  }
  if (days === 0) return 'DUE TODAY';
  return `DUE IN ${days} ${days === 1 ? 'DAY' : 'DAYS'}`;
}

/** `+4.2 / 100 km` — the hero numeral's numerator and target. */
export function formatValuePair(
  current: number,
  target: number,
  unit?: string | null
): string {
  const suffix = unit ? ` ${unit}` : '';
  return `${formatValue(current)} / ${formatValue(target)}${suffix}`;
}

/**
 * Trim trailing zeros so `12.0 km` reads as `12 km` and `4.5 km` keeps its half.
 *
 * Display numbers are the heroes on this page; `12.000000000000002` is not.
 */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

/** `73%` — clamped, so an overshoot renders as 100% rather than 118%. */
export function formatPercent(share: number): string {
  const pct = Math.round(clampShare(share) * 100);
  return `${pct}%`;
}