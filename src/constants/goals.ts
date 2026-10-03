'use client';

/**
 * `/goals` presentational constants.
 *
 * Client-safe by construction: this file imports **nothing**. The Prisma enums
 * (`GoalType`, `GoalPriority`, `GoalStatus`) are mirrored as string unions
 * because importing them as *values* from `@/generated/prisma` would pull the
 * Node Prisma client — 679 KB and a pile of Node built-ins — into the browser
 * bundle. That has already happened twice in this repo, so every client-side
 * enum in the app goes through a plain object like this one.
 *
 * `tests/lib/enums.test.ts` keeps the mirrors in sync with the schema.
 */

import type { PaceState } from '@/lib/goals/goal-metrics';

/* ────────────────────────────────────────────────────────────────────────────
 * Enums
 * ──────────────────────────────────────────────────────────────────────────── */

export const GOAL_TYPES = [
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM',
] as const;

export type GoalTypeValue = (typeof GOAL_TYPES)[number];

export const GOAL_PRIORITIES = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
  'PERSONAL',
  'ACADEMIC',
  'PROFESSIONAL',
  'NON_PROFIT',
] as const;

export type GoalPriorityValue = (typeof GOAL_PRIORITIES)[number];

export const GOAL_STATUSES = [
  'ACTIVE',
  'COMPLETED',
  'MISSED',
  'CARRIED_OVER',
  'ON_HOLD',
  'CANCELLED',
] as const;

export type GoalStatusValue = (typeof GOAL_STATUSES)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * Labels
 * ──────────────────────────────────────────────────────────────────────────── */

export const GOAL_TYPE_LABEL: Record<GoalTypeValue, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  CUSTOM: 'Custom',
};

/**
 * How long each goal type runs by default, in days.
 *
 * Used to pre-fill the deadline field, so a user picking "Quarterly" sees a
 * quarterly deadline rather than a blank box they have to reason about. The
 * server's own fallback for an omitted end date is 365 days regardless of type;
 * this only changes what the *form* proposes, so the value shown is always an
 * explicit, editable choice rather than an invisible default.
 */
export const GOAL_TYPE_SPAN_DAYS: Record<GoalTypeValue, number> = {
  DAILY: 365,
  WEEKLY: 90,
  MONTHLY: 180,
  QUARTERLY: 270,
  YEARLY: 365,
  CUSTOM: 365,
};

export const GOAL_PRIORITY_LABEL: Record<GoalPriorityValue, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  PERSONAL: 'Personal',
  ACADEMIC: 'Academic',
  PROFESSIONAL: 'Professional',
  NON_PROFIT: 'Non-profit',
};

export const GOAL_STATUS_LABEL: Record<GoalStatusValue, string> = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  MISSED: 'Missed',
  CARRIED_OVER: 'Carried over',
  ON_HOLD: 'Paused',
  CANCELLED: 'Cancelled',
};

/**
 * A short tick colour for the priority marker.
 *
 * Deliberately **not** the `--pace-*` scale. Pace owns colour on this page, and a
 * priority that borrowed the same ramp would put two different meanings in one
 * hue — which is how the old badge map ended up rendering CRITICAL and HIGH
 * identically. Priority is a one-word label plus a 3px tick; pace is the only
 * thing allowed to speak in colour.
 */
export const PRIORITY_TICK: Record<GoalPriorityValue, string> = {
  CRITICAL: 'var(--destructive)',
  HIGH: 'var(--accent-focus)',
  MEDIUM: 'var(--muted-foreground)',
  LOW: 'var(--pace-idle)',
  PERSONAL: 'var(--accent-score)',
  ACADEMIC: 'var(--accent-sleep)',
  PROFESSIONAL: 'var(--accent-routine)',
  NON_PROFIT: 'var(--accent-habits)',
};

/* ────────────────────────────────────────────────────────────────────────────
 * Pace tokens
 * ──────────────────────────────────────────────────────────────────────────── */

/** Solid stroke colour for a pace state — the marker itself. */
export const PACE_COLOR: Record<PaceState, string> = {
  ahead: 'var(--pace-ahead)',
  on_pace: 'var(--pace-on)',
  behind: 'var(--pace-behind)',
  overdue: 'var(--pace-overdue)',
  done: 'var(--pace-done)',
  inactive: 'var(--pace-idle)',
};

/** Low-attention fill for the gap wedge between the two markers. */
export const PACE_WASH: Record<PaceState, string> = {
  ahead: 'var(--pace-ahead-wash)',
  on_pace: 'var(--pace-on-wash)',
  behind: 'var(--pace-behind-wash)',
  overdue: 'var(--pace-overdue-wash)',
  done: 'var(--pace-done-wash)',
  inactive: 'var(--pace-idle-wash)',
};

/**
 * Text colour for a pace label, on a card surface.
 *
 * Separate from {@link PACE_COLOR} because the marker sits on the rail and the
 * label sits on `--card`; the two surfaces are close enough that one value
 * cannot serve both at AA.
 */
export const PACE_TEXT: Record<PaceState, string> = {
  ahead: 'text-pace-ahead',
  on_pace: 'text-pace-on',
  behind: 'text-pace-behind',
  overdue: 'text-pace-overdue',
  done: 'text-pace-done',
  inactive: 'text-pace-idle',
};

/**
 * How alarming a pace state reads, 0..1.
 *
 * Drives the **severity taper** on the behind wedge: the further behind a goal
 * falls, the more saturated its wedge gets, so a 6-point slip and a 60-point one
 * do not look identical. Bounded and deliberately compressed — `gapPoints` is
 * unbounded, so a goal 5× over its window would otherwise saturate the colour
 * and lose the distinction entirely.
 *
 * `overdue` sits above plain `behind` because a closed window is a stronger
 * fact than a live deficit, even though both are "late" in the everyday sense.
 */
export function paceSeverity(state: PaceState, gapPoints: number): number {
  switch (state) {
    case 'behind':
      // 0 at the band edge, 1 at 0.5 (50 points) behind.
      return Math.min(1, Math.max(0, (-gapPoints - 0.05) / 0.45));
    case 'overdue':
      return 1;
    case 'ahead':
      // Ahead is calm by design: it fades rather than intensifies.
      return Math.min(1, Math.max(0, (gapPoints - 0.05) / 0.45)) * 0.4;
    case 'on_pace':
      return 0;
    case 'done':
      return 1;
    default:
      return 0;
  }
}

/** Wedge alpha for a state at a given severity, 0..1. */
export function wedgeOpacity(state: PaceState, gapPoints: number): number {
  return 0.35 + 0.65 * paceSeverity(state, gapPoints);
}