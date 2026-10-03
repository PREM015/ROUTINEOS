import { auth } from '@/lib/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthRateLimit, rateLimited } from '@/lib/security/auth-rate-limit';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/auth/2fa/setup
 * Generate (or return the existing) TOTP secret and provisioning URI for
 * the authenticated user.
 *
 * The secret is generated server-side. It previously accepted a
 * caller-supplied `secret`, which let the client choose the shared secret.
 */
export async function POST(request: NextRequest) {
  const limit = checkAuthRateLimit(request, '2fa-setup', { max: 10, windowMs: 60_000 });
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authService = new AuthService();
    const result = await authService.setupTwoFactor(userIdFromSession(session));

    return NextResponse.json({
      success: true,
      data: {
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
      },
    });
  } catch (error) {
    console.error('Error setting up two-factor authentication:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to set up two-factor authentication' },
      { status: 500 }
    );
  }
}
