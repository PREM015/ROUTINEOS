import { UserRepository } from '@/server/repositories/user.repository';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/profile
 * Fetch a public profile plus aggregated stats for a user.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    const userRepository = new UserRepository();
    const user = await userRepository.findById(id);
    if (!user || user.isDeleted || !user.isActive) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userService = new UserService();
    const stats = await userService.getUserStats(id);

    return NextResponse.json({
      success: true,
      data: {
        profile: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          timezone: user.timezone,
          preferredLanguage: user.preferredLanguage,
          onboardingCompletedAt: user.onboardingCompletedAt,
          createdAt: user.createdAt,
        },
        stats,
      },
    });
  } catch (error) {
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