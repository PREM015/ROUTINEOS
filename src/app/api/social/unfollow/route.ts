import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { followUserSchema } from '@/schemas/social.schema';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/social/unfollow
 * Stop following another user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = followUserSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    await socialService.unfollow(userIdFromSession(session), validated.data.userId);

    return NextResponse.json({ success: true, data: { following: false } });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        { error: 'You are not following this user' },
        { status: 404 }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to unfollow user' },
      { status: 500 }
    );
  }
}
