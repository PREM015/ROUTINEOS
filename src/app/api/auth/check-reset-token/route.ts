import { authTokenRepository } from '@/server/repositories/auth-token.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const checkResetTokenSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
});

/**
 * POST /api/auth/check-reset-token
 * Check whether a password-reset token is still valid without consuming it.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = checkResetTokenSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const valid = await authTokenRepository.isResetTokenValid(
      validated.data.token
    );

    return NextResponse.json({ success: true, data: { valid } });
  } catch (error) {
    console.error('Error checking reset token:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to check reset token' },
      { status: 500 }
    );
  }
}