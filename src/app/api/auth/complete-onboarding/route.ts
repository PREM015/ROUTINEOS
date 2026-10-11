import { auth } from '@/lib/auth';
import { handleError } from '@/lib/errors/error-handler';
import { UserService } from '@/server/services/user.service';
import { NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * POST /api/auth/complete-onboarding
 *
 * Stamps `User.onboardingCompletedAt`.
 *
 * `UserService.completeOnboarding` existed but had no route, so nothing ever
 * marked onboarding as done — the wizard simply redirected to the dashboard and
 * the flag stayed null forever.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await new UserService().completeOnboarding(userIdFromSession(session));

    return NextResponse.json({
      success: true,
      data: { onboardingCompletedAt: user.onboardingCompletedAt },
    });
  } catch (error) {
    return handleError(error);
  }
}
