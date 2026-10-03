import { auth } from '@/lib/auth';
import { pushSubscriptionService } from '@/server/services/push-subscription.service';
import { createSubscriptionSchema } from '@/schemas/push-subscription.schema';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

/**
 * Push Subscription Route
 * GET  /api/push-subscriptions – list the user's push subscriptions
 * POST /api/push-subscriptions – register a web push subscription
 *
 * The Zod schema now lives in `src/schemas/push-subscription.schema.ts` so the
 * service validates the same shape the route does.
 */

/**
 * GET /api/push-subscriptions
 * List push subscriptions registered by the user.
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscriptions = await pushSubscriptionService.listForUser(userIdFromSession(session));

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('Error fetching push subscriptions:', error);
    return NextResponse.json({ error: 'Failed to fetch push subscriptions' }, { status: 500 });
  }
}

/**
 * POST /api/push-subscriptions
 * Register a push subscription. Re-subscribing the same endpoint refreshes it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = createSubscriptionSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.flatten() },
        { status: 400 }
      );
    }

    const subscription = await pushSubscriptionService.register(
      userIdFromSession(session),
      validated.data
    );

    return NextResponse.json({ success: true, data: subscription }, { status: 201 });
  } catch (error) {
    console.error('Error creating push subscription:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create push subscription' }, { status: 500 });
  }
}
