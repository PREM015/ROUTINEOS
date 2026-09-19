import {
  subscriptionRepository,
  type UpsertSubscriptionData,
} from '@/server/repositories/subscription.repository';
import type { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

const SUBSCRIPTION_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELLED',
  unpaid: 'UNPAID',
};

const SUBSCRIPTION_PLAN_MAP: Record<string, SubscriptionPlan> = {
  free: 'FREE',
  pro: 'PRO',
  premium: 'PREMIUM',
  enterprise: 'ENTERPRISE',
};

interface StripeSubscriptionObject {
  id?: string;
  customer?: string;
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: { userId?: string };
  items?: {
    data?: Array<{
      price?: { metadata?: { plan?: string } };
    }>;
  };
}

interface StripeWebhookPayload {
  data?: { object?: StripeSubscriptionObject };
}

const MONTH_SECONDS = 30 * 24 * 60 * 60;

/**
 * POST /api/billing/webhook
 * Handle a Stripe-style billing webhook. The raw request body is parsed
 * as JSON and used to upsert the user's subscription. Signature presence
 * is verified but the webhook secret is not re-validated.
 */
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    const rawBody = await request.text();
    let payload: StripeWebhookPayload = {};
    try {
      payload = JSON.parse(rawBody) as StripeWebhookPayload;
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const object = payload.data?.object;
    if (!object || typeof object !== 'object') {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    const stripeSubscriptionId = object.id;
    const status = object.status
      ? SUBSCRIPTION_STATUS_MAP[object.status]
      : undefined;
    if (!stripeSubscriptionId || !status) {
      return NextResponse.json(
        { error: 'Unsupported subscription data' },
        { status: 400 }
      );
    }

    const planName = object.items?.data?.[0]?.price?.metadata?.plan ?? 'pro';
    const plan = SUBSCRIPTION_PLAN_MAP[planName] ?? 'PRO';

    const startSec =
      object.current_period_start ?? Math.floor(Date.now() / 1000);
    const endSec = object.current_period_end ?? startSec + MONTH_SECONDS;

    const data: UpsertSubscriptionData = {
      plan,
      status,
      currentPeriodStart: new Date(startSec * 1000),
      currentPeriodEnd: new Date(endSec * 1000),
      cancelAtPeriodEnd: object.cancel_at_period_end ?? false,
      stripeCustomerId: object.customer ?? null,
      stripeSubscriptionId,
    };

    // Resolve the owning user: prefer the metadata userId carried on the
    // Stripe object, then fall back to an existing subscription row.
    let targetUserId = object.metadata?.userId ?? null;
    if (!targetUserId) {
      const existing =
        await subscriptionRepository.findByStripeSubscriptionId(
          stripeSubscriptionId
        );
      targetUserId = existing?.userId ?? null;
    }
    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Unable to resolve user for subscription' },
        { status: 400 }
      );
    }

    await subscriptionRepository.upsertByUserId(targetUserId, data);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing billing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}