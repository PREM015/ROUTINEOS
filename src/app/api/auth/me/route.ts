import { auth } from '@/lib/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextResponse } from 'next/server';

/**
 * GET /api/auth/me
 * Fetch the complete profile (with settings) for the authenticated user.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authService = new AuthService();
    const user = await authService.getCurrentUser(session.user.id);

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    console.error('Error fetching current user:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch current user' },
      { status: 500 }
    );
  }
}