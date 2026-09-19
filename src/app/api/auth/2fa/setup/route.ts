import { auth } from '@/lib/auth';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const setupTwoFactorSchema = z.object({
  secret: z.string().min(1).optional(),
});

/**
 * POST /api/auth/2fa/setup
 * Generate (or return the existing) TOTP secret and provisioning URI for
 * the authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const validated = setupTwoFactorSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    const result = await authService.setupTwoFactor(
      session.user.id,
      validated.data.secret
    );

    return NextResponse.json({
      success: true,
      data: {
        secret: result.secret,
        otpauthUrl: result.otpauthUrl,
      },
    });
  } catch (error) {
    console.error('Error setting up two-factor authentication:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to set up two-factor authentication' },
      { status: 500 }
    );
  }
}