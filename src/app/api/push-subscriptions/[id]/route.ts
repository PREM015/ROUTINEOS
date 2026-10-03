import { auth } from '@/lib/auth';
import { pushSubscriptionService } from '@/server/services/push-subscription.service';
import { NotFoundError } from '@/lib/errors/app-error';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Push Subscription by ID Route
 * DELETE /api/push-subscriptions/[id] – remove a push subscription
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/push-subscriptions/[id]
 * Remove a push subscription owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const { id: paramId } = await params;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await pushSubscriptionService.remove(session.user.id, paramId);
    return NextResponse.json({ success: true, data: { id: paramId } });
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'Push subscription not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete push subscription' }, { status: 500 });
  }
}
