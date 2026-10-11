import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';
import { followUserSchema } from '@/schemas/social.schema';
import { handleError } from '@/lib/errors/error-handler';
import { userIdFromSession } from '@/types/ids';

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

    const result = await socialService.follow(userIdFromSession(session), validated.data.userId);

    return NextResponse.json(
      { success: true, data: { following: true, connection: result.connection } },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
