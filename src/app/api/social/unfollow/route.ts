import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { socialService } from '@/server/services/social.service';
import { followUserSchema } from '@/schemas/social.schema';
import { handleError } from '@/lib/errors/error-handler';
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
    return handleError(error);
  }
}
