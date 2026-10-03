import { userService } from '@/server/services/user.service';
import { auth } from '@/lib/auth';
import { RateLimiter } from '@/lib/middleware/rate-limit';
import { RateLimitError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { toUserId } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Public profiles are intentionally unauthenticated — the leaderboard reads
 * other users' profiles. That makes this route an enumeration oracle unless it
 * is constrained, so it is rate-limited per client IP.
 *
 * Which fields are exposed, and the `profilePublic` privacy switch, are now
 * enforced in `UserService.getPublicProfile` rather than here. The rate limiter
 * stays in the route: it is keyed on the request's client IP, which only exists
 * at the HTTP boundary.
 */
const publicProfileLimiter = new RateLimiter({
  max: 30,
  windowMs: 60_000,
  keyPrefix: 'public-user',
});

/**
 * GET /api/users/[id]
 * Fetch a public profile with only safe, publicly visible fields.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    publicProfileLimiter.check(publicProfileLimiter.keyFor(request));

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    // Optional: a signed-in owner must still see their own profile even when
    // they have set it private, so the viewer id is read but never required.
    const viewerId = (await auth())?.user?.id;

    const profile = await userService.getPublicProfile(toUserId(id), viewerId);
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('Error fetching public profile:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch public profile' },
      { status: 500 }
    );
  }
}
