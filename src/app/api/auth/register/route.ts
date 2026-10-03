import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/server/services/auth.service';
import { registerSchema } from '@/lib/validation/auth';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';

/**
 * POST /api/auth/register
 * Create a new account. All registration rules (email format, password
 * strength, duplicate-email rejection, settings + streak + verification email)
 * live in AuthService.
 */
export async function POST(req: NextRequest) {
  // Unauthenticated, and it both creates accounts and sends a verification
  // email per call, so it needs its own bound.
  const limit = checkAuthRateLimit(req, 'register', AUTH_RATE_LIMITS.register);
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const user = await authService.registerUser(parsed.data);

    return NextResponse.json(
      {
        success: true,
        message: 'User registered successfully',
        data: { id: user.id, email: user.email },
      },
      { status: 201 }
    );
  } catch (error) {
    // Do not echo the raw error message back. `registerUser` throws a
    // distinct message for a duplicate email, so forwarding it turned this
    // endpoint into a confirmation oracle ("is this address registered?")
    // that is reachable without any authentication. The status is still 400
    // for genuine bad input; duplicate registrations are masked behind the
    // same generic text.
    const message =
      error instanceof Error && !/already/i.test(error.message)
        ? error.message
        : 'Unable to create an account with those details.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
