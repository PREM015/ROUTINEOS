import { auth } from '@/lib/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const verifyTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit code'),
});

/**
 * POST /api/auth/2fa/verify
 * Verify a TOTP code and enable two-factor authentication for the
 * authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = verifyTwoFactorSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    const result = await authService.verifyTwoFactor(
      session.user.id,
      validated.data.code
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error verifying two-factor code:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to verify two-factor code' },
      { status: 500 }
    );
  }
}