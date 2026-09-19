import { auth } from '@/lib/auth';
import { UserService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const revokeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session id is required'),
});

/**
 * GET /api/auth/sessions
 * List all active device sessions for the authenticated user.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userService = new UserService();
    const sessions = await userService.getSessions(session.user.id);

    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/sessions
 * Revoke a single device session owned by the authenticated user.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = revokeSessionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userService = new UserService();
    const result = await userService.revokeSession(
      session.user.id,
      validated.data.sessionId
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error revoking session:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to revoke session' },
      { status: 500 }
    );
  }
}