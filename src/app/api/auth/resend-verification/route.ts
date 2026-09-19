import { resendVerificationSchema } from '@/lib/validation/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/resend-verification
 * Resend the email verification link. Throttled to once per minute.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = resendVerificationSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    const result = await authService.resendVerification(validated.data.email);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error resending verification email:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to resend verification email' },
      { status: 500 }
    );
  }
}