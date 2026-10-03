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

const verifyTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit code'),
});

/**
 * POST /api/auth/2fa/verify
 * Verify a TOTP code and enable two-factor authentication for the
 * authenticated user.
 */
export async function POST(request: NextRequest) {
  // A 6-digit TOTP space is small (1e6) and `verifyTotpCode` accepts three
  // adjacent windows, so an unthrottled endpoint would eventually be walked
  // by a persistent attacker.
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
    const validated = verifyTwoFactorSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    const result = await authService.verifyTwoFactor(
      userIdFromSession(session),
      validated.data.code
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error verifying two-factor code:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to verify two-factor code' },
      { status: 500 }
    );
  }
}
