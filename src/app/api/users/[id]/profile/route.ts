import { UserRepository } from '@/server/repositories/user.repository';
import { UserService } from '@/server/services/user.service';
import { RateLimiter } from '@/lib/middleware/rate-limit';
import { RateLimitError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Public profiles are intentionally unauthenticated — the leaderboard and the
 * profile page both read other users. That makes this route an enumeration
 * oracle unless it is constrained, so it is rate-limited per client IP.
 *
 * Deliberately NOT exposed here: `role` (privilege information),
 * `preferredLanguage` and `timezone` (locale / approximate-location signals),
 * `onboardingCompletedAt` (an account-age signal useful for fingerprinting) and
 * `email`. The signed-in user's own copy of these comes from
 * `/api/user/profile`, which is authenticated.
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

    const user = await new UserRepository().findById(id);
    if (!user || user.isDeleted || !user.isActive) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const stats = await new UserService().getUserStats(id);

    return NextResponse.json({
      success: true,
      data: {
        profile: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          createdAt: user.createdAt,
        },
        stats,
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('Error fetching user profile:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}
