import { auth } from '@/lib/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';
import { userIdFromSession } from '@/types/ids';

const disableTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit code'),
});

/**
 * POST /api/auth/2fa/disable
 * Disable two-factor authentication for the authenticated user.
 */
export async function POST(request: NextRequest) {
  const limit = checkAuthRateLimit(request, 'twoFactor', AUTH_RATE_LIMITS.twoFactor);
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = disableTwoFactorSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    // The validated code must be passed through — it used to be discarded here,
    // which meant any six digits disabled 2FA.
    const result = await authService.disableTwoFactor(
      userIdFromSession(session),
      validated.data.code
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error disabling two-factor authentication:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to disable two-factor authentication' },
      { status: 500 }
    );
  }
}
