/**
 * Which sleep target this user has, and what to call it.
 *
 * ## Why this is shared rather than duplicated
 *
 * `sleep.service.logSleep` already resolves the target as
 * `settings?.minSleepDuration ?? default`. This module is the same rule, extracted so the
 * analytics card and the sleep logger cannot drift — and so the rule can be tested without
 * a database.
 *
 * Two things that used to go wrong are handled here rather than at the call site:
 *
 *  - **The app default is labelled as such.** "8 hours" is two different claims — a number
 *    the user chose, and a number nobody did. A card that says "your target" when nothing
 *    is set is asserting something false about the user's own settings.
 *  - **An out-of-range stored value falls back rather than passing through.** The settings
 *    schema bounds `minSleepDuration` to 60–720, but seeds, CSV import and admin edits all
 *    write without going through it. A stored `0` would make every night "meet target",
 *    which is not a failure state so much as a switch that got stuck on.
 *
 * Pure and dependency-free: no repository, no Prisma, no environment.
 */

import { APP_CONFIG } from '@/config/app';

/** Below this, "met target" stops meaning anything useful. */
export const MIN_SANE_SLEEP_TARGET = 60;
/** Above this, a target is a typo rather than a plan. 720 = 12 hours. */
export const MAX_SANE_SLEEP_TARGET = 720;

export type SleepTargetSource = 'user' | 'app-default';

export interface SleepTargetInput {
  minSleepDuration: number | null;
  targetBedtime: string | null;
  targetWakeTime: string | null;
}

export interface SleepTarget {
  minutes: number;
  source: SleepTargetSource;
  bedtime: string | null;
  wakeTime: string | null;
}

/**
 * Resolve the target, and say where it came from.
 *
 * `settings` may be `null` for an account with no settings row at all, which is a normal
 * state rather than an error — the app default applies and is labelled as such.
 */
export function resolveSleepTarget(settings: SleepTargetInput | null): SleepTarget {
  const configured = settings?.minSleepDuration ?? null;

  const usable =
    configured !== null &&
    Number.isFinite(configured) &&
    configured >= MIN_SANE_SLEEP_TARGET &&
    configured <= MAX_SANE_SLEEP_TARGET
      ? configured
      : null;

  return {
    minutes: usable ?? APP_CONFIG.defaults.sleep.targetDuration,
    source: usable === null ? 'app-default' : 'user',
    bedtime: normalizeTime(settings?.targetBedtime ?? null),
    wakeTime: normalizeTime(settings?.targetWakeTime ?? null),
  };
}

/**
 * Did the night meet the target?
 *
 * `null` for an unmeasured night — `actualDurationMinutes` being `null` is "not logged",
 * not "logged zero", and the two must not collapse.
 */
export function meetsSleepTarget(durationMinutes: number | null, target: SleepTarget): boolean | null {
  if (durationMinutes === null) return null;
  return durationMinutes >= target.minutes;
}

/**
 * How much of the target the night covered, clamped to `[0, 100]`.
 *
 * Takes the target **minutes** rather than the whole `SleepTarget`. The card already has
 * the resolved numbers from the payload, and accepting a full object here would mean
 * rebuilding one just to read a single field — the sort of ceremony that tempts the next
 * caller into duplicating the percentage inline instead.
 *
 * A percentage, because it is comparable across nights with different targets and needs no
 * interpretation — but clamped, because 140% of a target is "comfortably past it" rather
 * than a bar running off the end of its track.
 *
 * `100` is reached exactly when the target was met, so a bar at full and the met/not-met
 * verdict cannot disagree.
 */
export function targetProgress(durationMinutes: number | null, targetMinutes: number): number | null {
  if (durationMinutes === null || targetMinutes <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((durationMinutes / targetMinutes) * 100)));
}

/**
 * How far the night was from the target, in minutes, as a **signed gap**.
 *
 * Positive means short by that much, negative means over by that much. Signed rather than
 * two functions (`shortBy`/`overBy`) because the card has to choose between the two anyway,
 * and returning `0` for an exactly-met night keeps "met" a single value to test.
 */
export function minutesToTarget(durationMinutes: number | null, targetMinutes: number): number | null {
  if (durationMinutes === null) return null;
  return targetMinutes - durationMinutes;
}

/** `7h 30m`, or `8h` when it divides evenly. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The label for the target, which differs by source. */
export function targetLabel(target: SleepTarget): string {
  return target.source === 'user' ? 'Your target' : 'App target';
}

/**
 * Trim a stored `HH:mm`, or `null`.
 *
 * The column is a nullable string rather than an enum, so an empty string and a
 * whitespace-only value are both reachable and would otherwise render as a stray dash.
 */
function normalizeTime(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null;
}
