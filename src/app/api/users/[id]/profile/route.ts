import { userService } from '@/server/services/user.service';
import { auth } from '@/lib/auth';
import { RateLimiter } from '@/lib/middleware/rate-limit';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { toUserId } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Public profiles are intentionally unauthenticated — the leaderboard and the
 * profile page both read other users. That makes this route an enumeration oracle
 * unless it is constrained, so it is rate-limited per client IP.
 *
 * Which fields are exposed, and the `profilePublic` privacy switch, are enforced
 * in `UserService.getPublicProfileWithStats`. This route previously re-read the
 * user directly and skipped that check entirely, so a profile the owner had set
 * private was still served here in full, along with their activity counts —
 * while `GET /api/users/[id]`, serving the same data, correctly returned 404.
 *
 * The rate limiter stays in the route: it is keyed on the request's client IP,
 * which only exists at the HTTP boundary.
 */
const publicProfileLimiter = new RateLimiter({
  max: 30,
  windowMs: 60_000,
  keyPrefix: 'public-profile',
});

/**
 * GET /api/users/[id]/profile
 * Fetch a public profile plus aggregated stats for a user.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    publicProfileLimiter.check(publicProfileLimiter.keyFor(request));

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const viewerId = (await auth())?.user?.id;

    const data = await userService.getPublicProfileWithStats(toUserId(id), viewerId);
    if (!data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return handleError(error);
  }
}
