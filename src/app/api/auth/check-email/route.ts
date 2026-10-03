import { userService } from '@/server/services/user.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AUTH_RATE_LIMITS,
  checkAuthRateLimit,
  rateLimited,
} from '@/lib/security/auth-rate-limit';

const checkEmailSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

/**
 * POST /api/auth/check-email
 * Check whether an email address is already registered. Returns a boolean
 * availability flag for signup forms.
 *
 * This is a deliberate product feature (the signup form needs it) and it is
 * also an email-enumeration oracle, which is why it is rate limited: without
 * a bound, an attacker can sweep an address list at full speed.
 */
export async function POST(request: NextRequest) {
  const limit = checkAuthRateLimit(request, 'checkEmail', AUTH_RATE_LIMITS.checkEmail);
  if (!limit.ok) {
    return rateLimited(limit.retryAfterSeconds);
  }

  try {
    const body = await request.json();
    const validated = checkEmailSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const exists = await userService.emailExists(validated.data.email);

    return NextResponse.json({ success: true, data: { available: !exists } });
  } catch (error) {
    console.error('Error checking email availability:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to check email availability' },
      { status: 500 }
    );
  }
}
