import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * GET /api/auth/check-session
 * Return the current session user, or 401 when the request is unauthenticated.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: { authenticated: true, user: session.user },
  });
}