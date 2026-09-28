import { auth } from '@/lib/auth';
import { subscriptionService } from '@/server/services/subscription.service';
import { NextResponse } from 'next/server';

/**
 * GET /api/billing/subscription
 *
 * The caller's current plan, as recorded by `POST /api/billing/webhook`.
 *
 * Settings > Subscription and Settings > Billing previously hardcoded
 * "Free plan" and rendered a disabled button, so a paying customer could not
 * see their real plan anywhere in the app.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await subscriptionService.getSubscription(session.user.id);
    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    console.error('Error fetching subscription:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    );
  }
}
