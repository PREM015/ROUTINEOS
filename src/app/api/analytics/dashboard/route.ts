import { auth } from '@/lib/auth';
import { analyticsService } from '@/server/services/analytics.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession, type UserId } from '@/types/ids';
import { RateLimiter } from '@/lib/middleware/rate-limit';
import { RateLimitError, ValidationError } from '@/lib/errors/app-error';
import { ErrorReporter } from '@/lib/monitoring/error-reporter';
import { isCalendarDate } from '@/lib/dates';

/**
 * A real calendar date, not a well-shaped one.
 *
 * The shape regex alone let `2026-13-45` through, which became an Invalid Date in
 * the range maths and a `NaN` in every average computed from it. The refinement
 * rejects the impossible and the rolled-over (31 February) alike; see
 * `lib/dates.isCalendarDate`.
 */
const calendarDateSchema = z
  .string()
  .refine(isCalendarDate, { message: 'Expected a real YYYY-MM-DD calendar date' });

const dashboardQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).optional(),
  date: calendarDateSchema.optional(),
});

/**
 * Per user, not per IP.
 *
 * This is the most expensive read in the app — around thirty queries across
 * twenty repositories on every request — and it is authenticated, so the user id
 * is the honest key. An IP limit would let one office NAT throttle everyone in
 * the building for browsing backwards through their own history.
 *
 * Thirty a minute is well clear of the arrow-key browsing this page is built
 * around: holding "previous" produces one request per click, and the hook
 * discards every response but the newest, so even that costs the user nothing.
 */
const dashboardLimiter = new RateLimiter({
  max: 30,
  windowMs: 60_000,
  keyPrefix: 'analytics-dashboard',
});

/**
 * GET /api/analytics/dashboard
 * Period-scoped rollup (day / week / month / year) in the user's timezone,
 * plus every bento widget dataset. All analytics logic lives in
 * AnalyticsService so this handler stays thin.
 */
export async function GET(request: NextRequest) {
  /*
   * Hoisted so the `catch` can attribute the failure. `session` is block-scoped to
   * the `try`, so the error handler cannot see it - and reaching for it there is
   * exactly the mistake that made this route report `Cannot find name 'session'`.
   * It stays optional because a failure *before* authentication has no user to
   * attribute, and inventing one would be worse than reporting nothing.
   */
  let reportUserId: UserId | undefined;

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = userIdFromSession(session);
    reportUserId = userId;

    dashboardLimiter.check(`analytics-dashboard:${userId}`);

    const { searchParams } = new URL(request.url);
    const validated = dashboardQuerySchema.safeParse({
      period: searchParams.get('period') ?? undefined,
      date: searchParams.get('date') ?? undefined,
    });
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const data = await analyticsService.getDashboard(userId, {
      period: validated.data.period,
      date: validated.data.date,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    /*
      The service refuses a malformed period or date by throwing rather than
      falling back to a default, so this handler owns the translation to a status
      code. A caller that sent nonsense gets told so instead of being handed a
      plausible dashboard for a period they did not ask for.
    */
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    // A rejected request is the answer, not a fault: 401 is returned above and a
    // rate limit is returned above, so anything here is a genuine server failure.
    if (error instanceof Error) {
      // `reportUserId`, not the session: `session` is block-scoped to the `try` and is
      // unreachable here. Optional because a failure before authentication has no
      // user to attribute.
      ErrorReporter.report(error, {
        userId: reportUserId,
        route: '/api/analytics/dashboard',
      });
    }
    console.error('Error fetching dashboard analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard analytics' },
      { status: 500 }
    );
  }
}
