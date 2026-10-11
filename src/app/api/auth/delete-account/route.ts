import { auth, signOut } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { AuthService } from '@/server/services/auth.service';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { userIdFromSession } from '@/types/ids';

const deleteAccountSchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm account deletion' }),
  }),
  reason: z.string().max(2000, 'Reason must be 2000 characters or less').optional(),
});

/**
 * DELETE /api/auth/delete-account
 * Soft-delete the authenticated user's account after explicit confirmation,
 * then end the current session.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = deleteAccountSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const authService = new AuthService();
    await authService.deleteAccount(userIdFromSession(session), validated.data.reason);
    await signOut({ redirect: false });

    return NextResponse.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    return handleError(error);
  }
}
