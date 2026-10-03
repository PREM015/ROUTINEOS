import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { followUserSchema } from '@/schemas/social.schema';

/**
 * POST /api/social/follow
 * Follow another user.
 *
 * Self-follow 400, missing user 404, already following 409 — all decided in
 * `SocialService.follow` now.
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

    const result = await socialService.follow(session.user.id, validated.data.userId);

    return NextResponse.json(
      { success: true, data: { following: true, connection: result.connection } },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error following user:', error);
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to follow user' },
      { status: 500 }
    );
  }
}
