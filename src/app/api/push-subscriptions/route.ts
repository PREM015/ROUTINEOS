import { auth } from '@/lib/auth';
import { PushSubscriptionRepository } from '@/server/repositories/push-subscription.repository';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Push Subscription Route
 * GET  /api/push-subscriptions – list the user's push subscriptions
 * POST /api/push-subscriptions – register a web push subscription
 */

const deviceTypeSchema = z.enum(['WEB', 'MOBILE_IOS', 'MOBILE_ANDROID', 'TABLET', 'DESKTOP']);

const createSubscriptionSchema = z.object({
  endpoint: z.string().url('endpoint must be a valid URL'),
  p256dh: z.string().min(1, 'p256dh is required'),
  auth: z.string().min(1, 'auth is required'),
  deviceName: z.string().max(200, 'deviceName must be 200 characters or less').optional(),
  deviceType: deviceTypeSchema.optional(),
});

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

    const pushSubscriptionRepository = new PushSubscriptionRepository();
    const subscriptions = await pushSubscriptionRepository.findAll(session.user.id);

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

    const pushSubscriptionRepository = new PushSubscriptionRepository();
    const subscription = await pushSubscriptionRepository.create(session.user.id, {
      endpoint: validated.data.endpoint,
      p256dh: validated.data.p256dh,
      auth: validated.data.auth,
      deviceName: validated.data.deviceName,
      deviceType: validated.data.deviceType,
    });

    return NextResponse.json({ success: true, data: subscription }, { status: 201 });
  } catch (error) {
    console.error('Error creating push subscription:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create push subscription' }, { status: 500 });
  }
}