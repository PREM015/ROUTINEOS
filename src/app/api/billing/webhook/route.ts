import { billingService, type StripeSubscriptionPayload } from '@/server/services/billing.service';
import { NotFoundError, ValidationError } from '@/lib/errors/app-error';
import { verifyStripeSignature } from '@/lib/billing/verify-webhook-signature';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

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
 *
 * Once verified, the payload handling is domain logic and lives in
 * `BillingService.applySubscriptionEvent` — in particular the owner resolution,
 * which decides whose plan row gets written.
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
    | StripeSubscriptionPayload
    | undefined;

    if (!object || typeof object !== 'object') {
      return NextResponse.json(
        { error: 'Invalid webhook payload' },
        { status: 400 }
      );
    }

    const stripeSubscriptionId = object.id;
    if (!stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'Unsupported subscription data' },
        { status: 400 }
      );
    }

    // Owner resolution, status/plan mapping and the upsert are all in the
    // service. The owner lookup is the part that must not be duplicated: the
    // upsert is keyed on the user, so a wrong resolution overwrites a different
    // account's plan.
    await billingService.applySubscriptionEvent(
      stripeSubscriptionId,
      object as StripeSubscriptionPayload
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing billing webhook:', error);

    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'Unsupported subscription data' }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      // Retrying will not help: nothing identifies who this subscription belongs to.
      return NextResponse.json(
        { error: 'Unable to resolve user for subscription' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
