import { verifyEmailSchema } from '@/lib/validation/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/verify-email
 * Verify a user's email address using its one-time verification token.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = verifyEmailSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    const result = await authService.verifyEmail(validated.data.token);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error verifying email:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    );
  }
}