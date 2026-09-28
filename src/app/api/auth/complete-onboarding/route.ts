import { auth } from '@/lib/auth';
import { UserService } from '@/server/services/user.service';
import { NextResponse } from 'next/server';

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

    const user = await new UserService().completeOnboarding(session.user.id);

    return NextResponse.json({
      success: true,
      data: { onboardingCompletedAt: user.onboardingCompletedAt },
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to complete onboarding' },
      { status: 500 }
    );
  }
}
