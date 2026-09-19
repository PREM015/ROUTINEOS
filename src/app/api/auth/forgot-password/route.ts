import { forgotPasswordSchema } from '@/lib/validation/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/forgot-password
 * Request a password reset email. Never reveals whether the account exists.
 */
export async function POST(request: NextRequest) {
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