import { NextResponse } from 'next/server';
import { authService } from '@/server/services/auth.service';
import { registerSchema } from '@/lib/validation/auth';

/**
 * POST /api/auth/register
 * Create a new account. All registration rules (email format, password
 * strength, duplicate-email rejection, settings + streak + verification email)
 * live in AuthService.
 */
export async function POST(req: Request) {
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

    return NextResponse.json(
      {
        success: true,
        message: 'User registered successfully',
        data: { id: user.id, email: user.email },
      },
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
