import { auth } from '@/lib/auth';
import { pushSubscriptionService } from '@/server/services/push-subscription.service';
import type { RegisterDeviceInput } from '@/schemas/push-subscription.schema';
import { handleError } from '@/lib/errors/error-handler';
import { NextRequest, NextResponse } from 'next/server';
import { userIdFromSession } from '@/types/ids';

interface RouteContext {
  params: Promise<{ id: string }>;
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

    const subscriptions = await pushSubscriptionService.listForOwner(
      userIdFromSession(session),
      id
    );

    return NextResponse.json({ success: true, data: subscriptions });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/users/[id]/push-subscriptions
 * Register a new push subscription for the user
 *
 * The body is intentionally a loose cast rather than a strict schema: this is the
 * older per-user registration path, and the required-field check plus
 * `deviceType` normalisation now live in the service so they are applied
 * identically here and in `POST /api/push-subscriptions`.
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

    const body = (await request.json()) as RegisterDeviceInput;

    const subscription = await pushSubscriptionService.registerForOwner(
      userIdFromSession(session),
      id,
      body
    );

    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    return handleError(error);
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

    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId is required' }, { status: 400 });
    }

    await pushSubscriptionService.removeForOwner(
      userIdFromSession(session),
      id,
      subscriptionId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
