import { auth } from '@/lib/auth';
import { PushSubscriptionRepository } from '@/server/repositories/push-subscription.repository';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Push Subscription by ID Route
 * DELETE /api/push-subscriptions/[id] – remove a push subscription
 */

interface RouteContext {
  params: { id: string };
}

/**
 * DELETE /api/push-subscriptions/[id]
 * Remove a push subscription owned by the user.
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pushSubscriptionRepository = new PushSubscriptionRepository();
    const existing = await pushSubscriptionRepository.findById(session.user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Push subscription not found' }, { status: 404 });
    }

    await pushSubscriptionRepository.delete(session.user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id } });
  } catch (error) {
    console.error('Error deleting push subscription:', error);
    return NextResponse.json({ error: 'Failed to delete push subscription' }, { status: 500 });
  }
}