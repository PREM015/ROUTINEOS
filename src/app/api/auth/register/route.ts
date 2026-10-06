import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@/server/services/auth.service';
import { registerSchema } from '@/lib/validation/auth';
import { loginSchema } from '@/lib/validation/auth';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';

/**
 * POST /api/auth/register
 * Create a new account. Returns autoLogin flag to trigger client-side sign-in.
 */
export async function POST(req: NextRequest) {
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

    // Verify the credentials work (validates the user was created correctly)
    const loginParsed = loginSchema.safeParse({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (!loginParsed.success) {
      return NextResponse.json(
        { success: true, message: 'User registered successfully. Please sign in.', data: { id: user.id, email: user.email }, autoLogin: false },
        { status: 201 }
      );
    }

    const credentialsUser = await authService.verifyCredentials(loginParsed.data.email, loginParsed.data.password);
    if (!credentialsUser) {
      return NextResponse.json(
        { success: true, message: 'User registered successfully. Please sign in.', data: { id: user.id, email: user.email }, autoLogin: false },
        { status: 201 }
      );
    }

    // Credentials verified, client will call signIn
    return NextResponse.json(
      {
        success: true,
        message: 'User registered successfully',
        data: { id: user.id, email: user.email },
        autoLogin: true,
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error && !/already/i.test(error.message)
        ? error.message
        : 'Unable to create an account with those details.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
