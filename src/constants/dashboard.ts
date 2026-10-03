/**
 * `/dashboard` shared constants.
 *
 * Client-safe on purpose. `DEFAULT_WINDOW_DAYS` used to live on
 * `DashboardOverviewService`, and the client hook that fetches the overview
 * imported it from there — which pulled the service and every Prisma repository
 * it constructs into the browser bundle. Numbers that both sides need belong in
 * `src/constants`, not behind a server import.
 */

/**
 * Trailing window loaded by the overview endpoint.
 *
 * 30 is the longest range the Momentum panel offers, so the widest view needs no
 * refetch and the 7d toggle is a pure client-side slice.
 */
export const DEFAULT_WINDOW_DAYS = 30;

/** The two ranges the Momentum panel offers. */
export const DASHBOARD_RANGES = [7, 30] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

/**
 * Fractional improvement in weekly average that counts as "worth a badge".
 *
 * Below this the delta badge is suppressed: "vs last week +0.4%" is noise, and a
 * badge that fires on noise stops being read as news.
 */
export const DELTA_BADGE_THRESHOLD_PCT = 1;

/**
 * Day names for the context strip, indexed by `Date.prototype.getDay()`.
 * Monday-first ordering is applied by the caller.
 */
export const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;
