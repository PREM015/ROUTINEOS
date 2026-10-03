import { auth } from '@/lib/auth';
import { userService } from '@/server/services/user.service';
import { AuthorizationError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';
import { toUserId } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/users/[id]/settings
 * Fetch the settings for a user. Owner-only endpoint; the id must match
 * the authenticated user.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settings = await userService.getSettings(toUserId(id));

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching user settings:', error);

    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch user settings' },
      { status: 500 }
    );
  }
}