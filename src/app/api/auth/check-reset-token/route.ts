import { authTokenRepository } from '@/server/repositories/auth-token.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';

const checkResetTokenSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
});

/**
 * POST /api/auth/check-reset-token
 * Check whether a password-reset token is still valid without consuming it.
 *
 * The token itself is 256 bits of entropy, so this is not brute-forceable; the
 * limit is here because it is an unauthenticated validity oracle and should not
 * be freely pollable.
 *
 * NOTE: the rate limit and the Zod schema are deliberately *not* in a service.
 * The limiter is keyed on the request's client IP, which only exists at the HTTP
 * boundary, and this is the only caller of `isResetTokenValid` — the token is
 * consumed by a different repository method in the reset flow, so there is no
 * shared domain logic for a service to own here. This is the one place in the
 * §1 sweep where a repository call is the honest answer.
 */
export async function POST(request: NextRequest) {
  const limit = checkAuthRateLimit(
    request,
    'checkResetToken',
    AUTH_RATE_LIMITS.checkResetToken
  );
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const body = await request.json();
    const validated = checkResetTokenSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const valid = await authTokenRepository.isResetTokenValid(
      validated.data.token
    );

    return NextResponse.json({ success: true, data: { valid } });
  } catch (error) {
    console.error('Error checking reset token:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to check reset token' },
      { status: 500 }
    );
  }
}
