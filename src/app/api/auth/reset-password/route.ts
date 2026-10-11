import { resetPasswordSchema } from '@/schemas/auth.schema';
import { handleError } from '@/lib/errors/error-handler';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';

/**
 * POST /api/auth/reset-password
 * Reset the password using a one-time password reset token.
 */
export async function POST(request: NextRequest) {
  // Unauthenticated by necessity (the user cannot sign in yet), and it is the
  // step that makes a password guess valuable — so it is bounded.
  const limit = checkAuthRateLimit(
    request,
    'resetPassword',
    AUTH_RATE_LIMITS.resetPassword
  );
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const body = await request.json();
    const validated = resetPasswordSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    await authService.resetPassword(
      validated.data.token,
      validated.data.password
    );

    return NextResponse.json({
      success: true,
      message: 'Password has been reset',
    });
  } catch (error) {
    return handleError(error);
  }
}
