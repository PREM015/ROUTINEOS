import { resetPasswordSchema } from '@/lib/validation/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/auth/reset-password
 * Reset the password using a one-time password reset token.
 */
export async function POST(request: NextRequest) {
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
    console.error('Error resetting password:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}