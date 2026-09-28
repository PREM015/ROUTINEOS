import { auth } from '@/lib/auth';
import { PushSubscriptionRepository } from '@/server/repositories/push-subscription.repository';
import { NextRequest, NextResponse } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RegisterSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceName?: string;
  /**
   * Sent by the notifications settings page but previously not declared or read
   * here, so it was silently dropped and every device stored `deviceType = null`.
   * Kept as a plain string and validated against the known values so an
   * unexpected value cannot reach the enum column.
   */
  deviceType?: string;
}

const KNOWN_DEVICE_TYPES = ['WEB', 'MOBILE_IOS', 'MOBILE_ANDROID', 'TABLET', 'DESKTOP'] as const;

/**
 * Narrow an untrusted `deviceType` to a real enum value.
 *
 * The column is a Prisma enum, so an unexpected string would fail the whole
 * insert and the device would fail to register with a 400 that the UI could not
 * explain. Anything unrecognised becomes `null` (unknown), which the device list
 * already handles.
 */
function normalizeDeviceType(value: string | undefined): (typeof KNOWN_DEVICE_TYPES)[number] | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (KNOWN_DEVICE_TYPES as readonly string[]).includes(upper)
    ? (upper as (typeof KNOWN_DEVICE_TYPES)[number])
    : null;
}

/**
 * GET /api/users/[id]/push-subscriptions
 * List all push subscriptions for a user (owner-only)
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pushSubscriptionRepository = new PushSubscriptionRepository();
    const subscriptions = await pushSubscriptionRepository.findAll(id);

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('Error fetching push subscriptions:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to fetch push subscriptions' }, { status: 500 });
  }
}

/**
 * POST /api/users/[id]/push-subscriptions
 * Register a new push subscription for the user
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    // The Web Push payload field is `auth`; alias it so it cannot shadow the
    // imported `auth()` used for the session check above.
    //
    // `deviceType` was not destructured here even though the notifications
    // settings page sends it, so every device registered through this route was
    // stored with `deviceType = null` and the device list fell back to showing
    // the raw device name instead of a phone/laptop icon and label.
    const { endpoint, p256dh, auth: authSecret, deviceName, deviceType } =
      body as RegisterSubscriptionData;

    if (!endpoint || !p256dh || !authSecret) {
      return NextResponse.json(
        { error: 'Endpoint, p256dh, and auth are required' },
        { status: 400 }
      );
    }

    const pushSubscriptionRepository = new PushSubscriptionRepository();
    const subscription = await pushSubscriptionRepository.create(id, {
      endpoint,
      p256dh,
      auth: authSecret,
      deviceName: deviceName || 'Unknown Device',
      deviceType: normalizeDeviceType(deviceType),
    });

    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    console.error('Error registering push subscription:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to register push subscription' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]/push-subscriptions
 * Unregister a push subscription for the user
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const subscriptionId = searchParams.get('subscriptionId');

    if (typeof id !== 'string' || id.length === 0) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    if (session.user.id !== id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
    }

    const pushSubscriptionRepository = new PushSubscriptionRepository();
    await pushSubscriptionRepository.delete(id, subscriptionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unregistering push subscription:', error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to unregister push subscription' }, { status: 500 });
  }
}