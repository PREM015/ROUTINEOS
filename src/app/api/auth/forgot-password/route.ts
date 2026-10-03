import { forgotPasswordSchema } from '@/lib/validation/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';

/**
 * POST /api/auth/forgot-password
 * Request a password reset email. Never reveals whether the account exists.
 */
export async function POST(request: NextRequest) {
  // Unauthenticated, and it sends mail to an arbitrary address — an
  // unauthenticated email-bomb vector as much as a guessing vector.
  const limit = checkAuthRateLimit(request, 'forgotPassword', AUTH_RATE_LIMITS.forgotPassword);
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const body = await request.json();
    const validated = forgotPasswordSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    const result = await authService.forgotPassword(validated.data.email);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error requesting password reset:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to request password reset' },
      { status: 500 }
    );
  }
}
