import {
  subscriptionRepository,
  type UpsertSubscriptionData,
} from '@/server/repositories/subscription.repository';
import type { SubscriptionPlan, SubscriptionStatus } from '@/generated/prisma';
import { verifyStripeSignature } from '@/lib/billing/verify-webhook-signature';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

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

const MONTH_SECONDS = 30 * 24 * 60 * 60;

/**
 * POST /api/billing/webhook
 * Handle a Stripe billing webhook.
 *
 * SECURITY: the `stripe-signature` header is cryptographically verified
 * against `STRIPE_WEBHOOK_SECRET` over the **raw** request body before the
 * payload is parsed or trusted in any way. Without that check any unauthenticated
 * caller could forge a payload and grant themselves an arbitrary plan, so
 * verification fails closed — a payload that is not verified is never parsed
 * and never reaches the database.
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

    // Must be the raw body: parsing first would invalidate the signature.
    const rawBody = await request.text();

    const verification = verifyStripeSignature(rawBody, signature);
    if (!verification.ok) {
      if (verification.reason === 'NOT_CONFIGURED') {
        // Server misconfiguration, not a client error. Fail closed either way.
        console.error(
          '[billing/webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting webhook'
        );
        return NextResponse.json(
          { error: 'Webhook signature verification is not configured' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'Invalid stripe-signature' },
        { status: 400 }
      );
    }

    const event: Stripe.Event = verification.event;
    const object = event.data?.object as unknown as
      | StripeSubscriptionObject
      | undefined;

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
