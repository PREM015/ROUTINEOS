import { UserRepository } from '@/server/repositories/user.repository';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const checkEmailSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
});

/**
 * POST /api/auth/check-email
 * Check whether an email address is already registered. Returns a boolean
 * availability flag for signup forms.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = checkEmailSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const userRepository = new UserRepository();
    const exists = await userRepository.emailExists(validated.data.email);

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